import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScreenLayout } from '@/components/layout/screen-layout';
import { getDatabase, SCHEMA_VERSION } from '@/db/database';
import {
  CANONICAL_TABLE_NAMES,
  runSqliteDiagnostics,
  type SqliteDiagnosticsReport,
} from '@/db/sqlite-diagnostics';
import {
  lineHeight,
  radius,
  spacing,
  type ThemeColors,
  typeScale,
} from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type Phase = 'loading' | 'ready' | 'error' | 'timeout';

/**
 * Bounded, diagnostic-reporting-only timeout for the entire diagnostic run
 * (shared-handle open plus every check). It guarantees this screen reaches a
 * terminal state even if a native SQLite operation never settles. It does NOT
 * cancel, abort, or close the underlying operation — it only stops this screen
 * from waiting forever.
 */
const DIAGNOSTICS_TIMEOUT_MS = 30_000;

/** Progress label shown while the shared handle is still opening. */
const OPENING_CHECK_LABEL = 'Opening shared database';

type CheckState = 'pass' | 'fail' | 'warn' | 'unknown';

type CheckRow = {
  key: string;
  label: string;
  state: CheckState;
  detail: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function statusColor(state: CheckState, colors: ThemeColors): string {
  switch (state) {
    case 'pass':
      return colors.success;
    case 'fail':
      return colors.danger;
    case 'warn':
      return colors.warning;
    default:
      return colors.borderStrong;
  }
}

function statusText(state: CheckState): string {
  switch (state) {
    case 'pass':
      return 'PASS';
    case 'fail':
      return 'FAIL';
    case 'warn':
      return 'PARTIAL';
    default:
      return 'UNKNOWN';
  }
}

function buildCheckRows(report: SqliteDiagnosticsReport): CheckRow[] {
  const openState: CheckState =
    report.open === 'open'
      ? 'pass'
      : report.open === 'failed'
        ? 'fail'
        : 'unknown';

  const initState: CheckState =
    report.initialization === 'initialized'
      ? 'pass'
      : report.initialization === 'unknown'
        ? 'unknown'
        : 'fail';
  const initDetail =
    report.initialization === 'initialized'
      ? `Initialization reached schema version ${SCHEMA_VERSION}.`
      : report.initialization === 'not-initialized'
        ? 'user_version is 0 — migrations have not been applied yet.'
        : report.initialization === 'stale'
          ? `Recorded version ${report.userVersion} does not match the expected ${SCHEMA_VERSION}.`
          : 'Could not read the recorded schema version.';

  const userVersionState: CheckState =
    report.userVersion === null
      ? 'unknown'
      : report.userVersion === SCHEMA_VERSION
        ? 'pass'
        : 'fail';

  const tablesState: CheckState =
    report.missingTables.length === 0
      ? 'pass'
      : report.presentTables.length > 0
        ? 'warn'
        : 'fail';
  const tablesDetail =
    `${report.presentTables.length}/${CANONICAL_TABLE_NAMES.length} canonical tables present` +
    (report.missingTables.length > 0
      ? ` — missing: ${report.missingTables.join(', ')}`
      : '');

  const fkState: CheckState =
    report.foreignKeyEnforcement === 1
      ? 'pass'
      : report.foreignKeyEnforcement === 0
        ? 'fail'
        : 'unknown';
  const fkDetail =
    report.foreignKeyEnforcement === 1
      ? 'PRAGMA foreign_keys = ON — foreign keys are enforced on this connection.'
      : report.foreignKeyEnforcement === 0
        ? 'PRAGMA foreign_keys = OFF — foreign keys are not enforced on this connection.'
        : 'Could not read the foreign-key pragma.';

  return [
    {
      key: 'open',
      label: 'SQLite open',
      state: openState,
      detail:
        report.open === 'open'
          ? 'The shared database handle is open and responsive.'
          : 'Could not reach the shared database handle.',
    },
    {
      key: 'init',
      label: 'Initialization',
      state: initState,
      detail: initDetail,
    },
    {
      key: 'user_version',
      label: 'Schema version (user_version)',
      state: userVersionState,
      detail: `Recorded ${report.userVersion ?? 'n/a'} · expected ${SCHEMA_VERSION}`,
    },
    {
      key: 'tables',
      label: 'Canonical tables',
      state: tablesState,
      detail: tablesDetail,
    },
    {
      key: 'foreign_keys',
      label: 'Foreign-key enforcement',
      state: fkState,
      detail: fkDetail,
    },
    {
      key: 'read',
      label: 'Basic read test',
      state: report.readTest,
      detail:
        report.readTest === 'pass'
          ? 'A trivial read (SELECT 1) succeeded.'
          : 'The basic read probe failed.',
    },
    {
      key: 'smoke',
      label: 'Write / read / delete smoke',
      state: report.writeReadDeleteSmoke,
      detail:
        report.writeReadDeleteSmoke === 'pass'
          ? 'A scratch row was written, read back, deleted, and its table dropped — the real journal was left unchanged.'
          : 'The isolated write/read/delete round-trip failed.',
    },
  ];
}

function CheckRowView({
  label,
  state,
  detail,
}: {
  label: string;
  state: CheckState;
  detail: string;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createRowStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      <View
        style={[styles.dot, { backgroundColor: statusColor(state, colors) }]}
      />
      <View style={styles.body}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          <Text style={[styles.badge, { color: statusColor(state, colors) }]}>
            {statusText(state)}
          </Text>
        </View>
        <Text style={styles.detail}>{detail}</Text>
      </View>
    </View>
  );
}

export default function DevSqliteScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [phase, setPhase] = useState<Phase>('loading');
  const [report, setReport] = useState<SqliteDiagnosticsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentCheck, setCurrentCheck] = useState<string>(OPENING_CHECK_LABEL);
  const [stuckCheck, setStuckCheck] = useState<string>(OPENING_CHECK_LABEL);
  const currentCheckRef = useRef<string>(OPENING_CHECK_LABEL);

  useEffect(() => {
    // Development-only gate: never open the database or run diagnostics in a
    // production build, even if the route is reached directly.
    if (!__DEV__) {
      return;
    }

    let cancelled = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (
      nextPhase: 'ready' | 'error' | 'timeout',
      payload: {
        report?: SqliteDiagnosticsReport;
        error?: string;
        stuckCheck?: string;
      } = {}
    ) => {
      if (cancelled || settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (nextPhase === 'ready' && payload.report) {
        setReport(payload.report);
      } else if (nextPhase === 'error' && payload.error) {
        setError(payload.error);
      } else if (nextPhase === 'timeout') {
        setStuckCheck(payload.stuckCheck ?? currentCheckRef.current);
      }
      setPhase(nextPhase);
    };

    // The diagnostic run is one promise chain: open the shared handle, then
    // run every check. A bounded timer races this whole chain but never
    // cancels it — if the chain still settles after the timer fires, we simply
    // ignore it (the UI is already terminal). This converts any never-
    // settling native operation into a concrete terminal "timed out" state
    // instead of an indefinite spinner.
    const diagnosticsPromise = (async () => {
      const db = await getDatabase();
      return runSqliteDiagnostics(db, {
        onProgress: (label) => {
          if (!cancelled) {
            currentCheckRef.current = label;
            setCurrentCheck(label);
          }
        },
      });
    })();

    timer = setTimeout(() => {
      finish('timeout', { stuckCheck: currentCheckRef.current });
    }, DIAGNOSTICS_TIMEOUT_MS);

    diagnosticsPromise.then(
      (result) => finish('ready', { report: result }),
      (err) => finish('error', { error: errorMessage(err) })
    );

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    };
  }, []);

  if (!__DEV__) {
    return (
      <ScreenLayout
        title="SQLite Diagnostics"
        subtitle="Development build only"
      >
        <Text style={styles.muted}>
          Local SQLite diagnostics are only available in development builds.
        </Text>
      </ScreenLayout>
    );
  }

  if (phase === 'loading') {
    return (
      <ScreenLayout title="SQLite Diagnostics" subtitle="Running local checks…">
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.progressLabel}>{currentCheck}</Text>
        </View>
      </ScreenLayout>
    );
  }

  if (phase === 'timeout') {
    return (
      <ScreenLayout title="SQLite Diagnostics" subtitle="Timed out">
        <Text style={styles.error}>
          Diagnostics did not finish within{' '}
          {Math.round(DIAGNOSTICS_TIMEOUT_MS / 1000)} seconds.
        </Text>
        <View style={styles.timeoutBlock}>
          <Text style={styles.timeoutTitle}>Where it was stuck</Text>
          <Text style={styles.timeoutBody}>{stuckCheck}</Text>
          <Text style={styles.muted}>
            The underlying SQLite operation was not cancelled or interrupted —
            it is still running in the background. This timeout only stops this
            screen from waiting forever; it cannot unblock the operation itself.
          </Text>
        </View>
      </ScreenLayout>
    );
  }

  if (phase === 'error' || !report) {
    return (
      <ScreenLayout title="SQLite Diagnostics" subtitle="Local checks">
        <Text style={styles.error}>
          Diagnostics could not run{error ? `: ${error}` : '.'}
        </Text>
      </ScreenLayout>
    );
  }

  const rows = buildCheckRows(report);
  const passingCount = rows.filter((row) => row.state === 'pass').length;

  return (
    <ScreenLayout
      title="SQLite Diagnostics"
      subtitle="Development-only local database checks"
      fillCard
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Checks passing</Text>
          <Text style={styles.summaryValue}>
            {passingCount}/{rows.length}
          </Text>
        </View>

        <View style={styles.checkList}>
          {rows.map((row) => (
            <CheckRowView
              key={row.key}
              detail={row.detail}
              label={row.label}
              state={row.state}
            />
          ))}
        </View>

        {report.errors.length > 0 ? (
          <View style={styles.notesBlock}>
            <Text style={styles.notesTitle}>Notes</Text>
            {report.errors.map((line) => (
              <Text key={line} style={styles.note}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </ScreenLayout>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scroll: {
      flex: 1,
    },
    content: {
      gap: spacing.md,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    summaryLabel: {
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
    },
    summaryValue: {
      fontSize: typeScale.bodySm,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    checkList: {
      gap: spacing.md,
    },
    notesBlock: {
      gap: spacing.xs,
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
    },
    notesTitle: {
      fontSize: typeScale.bodySm,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    note: {
      fontSize: typeScale.bodySm,
      lineHeight: lineHeight.compact,
      color: colors.textSecondary,
    },
    center: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.xl,
    },
    muted: {
      fontSize: typeScale.body,
      color: colors.textSecondary,
    },
    error: {
      fontSize: typeScale.body,
      color: colors.danger,
    },
    progressLabel: {
      marginTop: spacing.md,
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    timeoutBlock: {
      gap: spacing.xs,
      marginTop: spacing.md,
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
    },
    timeoutTitle: {
      fontSize: typeScale.bodySm,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    timeoutBody: {
      fontSize: typeScale.body,
      fontWeight: '600',
      color: colors.textPrimary,
    },
  });

const createRowStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: radius.sm,
      marginTop: 3,
    },
    body: {
      flex: 1,
      gap: spacing.xs,
    },
    labelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    label: {
      fontSize: typeScale.body,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    badge: {
      fontSize: typeScale.bodySm,
      fontWeight: '700',
    },
    detail: {
      fontSize: typeScale.bodySm,
      lineHeight: lineHeight.compact,
      color: colors.textSecondary,
    },
  });
