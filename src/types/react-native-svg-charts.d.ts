declare module 'react-native-svg-charts' {
  import { Component } from 'react';

  type ContentInset = {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };

  type ChartProps = {
    data: unknown[];
    xAccessor?: (opts: { item: unknown; index: number }) => number;
    yAccessor?: (opts: { item: unknown; index: number }) => number;
    contentInset?: ContentInset;
    style?: unknown;
    curve?: unknown;
    start?: number;
    svg?: Record<string, unknown>;
    numberOfTicks?: number;
    formatLabel?: (value: number, index: number) => string;
  };

  export class AreaChart extends Component<ChartProps> {}
  export class LineChart extends Component<ChartProps> {}
  export class YAxis extends Component<ChartProps & { scale?: unknown }> {}
  export class XAxis extends Component<ChartProps & { scale?: unknown }> {}
}
