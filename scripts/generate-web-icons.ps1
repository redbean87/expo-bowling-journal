Add-Type -AssemblyName System.Drawing

function New-Icon {
  param(
    [int]$Size,
    [string]$Path,
    [bool]$Maskable
  )

  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  $background = [System.Drawing.Color]::FromArgb(245, 247, 251)
  $graphics.Clear($background)

  $margin = [int]($Size * 0.12)
  if ($Maskable) {
    $margin = [int]($Size * 0.06)
  }

  $circleX = [int]$margin
  $circleY = [int]$margin
  $circleW = [int]($Size - (2 * $margin))
  $circleH = [int]($Size - (2 * $margin))

  $blue = [System.Drawing.Color]::FromArgb(27, 110, 243)
  $circleBrush = New-Object System.Drawing.SolidBrush($blue)
  $graphics.FillEllipse($circleBrush, $circleX, $circleY, $circleW, $circleH)
  $circleBrush.Dispose()

  $fontSize = [single]($Size * 0.24)
  $font = New-Object System.Drawing.Font(
    'Segoe UI',
    $fontSize,
    [System.Drawing.FontStyle]::Bold,
    [System.Drawing.GraphicsUnit]::Pixel
  )
  $stringFormat = New-Object System.Drawing.StringFormat
  $stringFormat.Alignment = [System.Drawing.StringAlignment]::Center
  $stringFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
  $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $layoutRect = [System.Drawing.RectangleF]::new(
    [single]$circleX,
    [single]$circleY,
    [single]$circleW,
    [single]$circleH
  )
  $graphics.DrawString('BJ', $font, $textBrush, $layoutRect, $stringFormat)
  $textBrush.Dispose()
  $font.Dispose()

  $pinBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 196, 77))
  $pinWidth = [int]($Size * 0.07)
  $pinHeight = [int]($Size * 0.12)
  $pinX = [int](($Size * 0.5) - ($pinWidth / 2))
  $pinY = [int]($Size * 0.73)
  $graphics.FillRectangle($pinBrush, $pinX, $pinY, $pinWidth, $pinHeight)
  $pinBrush.Dispose()

  $ringPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(210, 225, 250), [single]($Size * 0.02))
  $graphics.DrawEllipse($ringPen, $circleX, $circleY, $circleW, $circleH)
  $ringPen.Dispose()

  $graphics.Dispose()
  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}

New-Item -ItemType Directory -Force -Path "assets/icons" | Out-Null

New-Icon -Size 1024 -Path "assets/icons/app-icon-1024.png" -Maskable:$false
New-Icon -Size 512 -Path "assets/icons/pwa-icon-512.png" -Maskable:$false
New-Icon -Size 512 -Path "assets/icons/pwa-icon-maskable-512.png" -Maskable:$true
New-Icon -Size 192 -Path "assets/icons/pwa-icon-192.png" -Maskable:$false
New-Icon -Size 180 -Path "assets/icons/apple-touch-icon.png" -Maskable:$false
New-Icon -Size 48 -Path "assets/icons/favicon.png" -Maskable:$false
