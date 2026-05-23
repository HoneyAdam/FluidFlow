Get-ChildItem 'D:\Codebox\PROJECTS\FluidFlow\utils\*.ts' | ForEach-Object {
  $lines = (Get-Content $_.FullName).Count
  "$lines`t$($_.Name)"
}
