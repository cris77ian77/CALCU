$xlFile = 'C:\Users\polla\Dropbox\000-CRIS\47- FABRICA DE HIELO\flujo fondos 70 h8.xlsx'
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$wb = $excel.Workbooks.Open($xlFile)
$sh = $wb.Sheets.Item(1)
$maxR = [Math]::Min($sh.UsedRange.Rows.Count, 100)
$maxC = [Math]::Min($sh.UsedRange.Columns.Count, 20)
for ($r=1; $r -le $maxR; $r++) {
    $row = ''
    for ($c=1; $c -le $maxC; $c++) {
        $v = $sh.Cells.Item($r,$c).Text
        if ($v -ne '') { $row = $row + 'C' + $c + '=' + $v + '  ' }
    }
    if ($row -ne '') { Write-Host ('R' + $r + '  ' + $row) }
}
$wb.Close($false)
$excel.Quit()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
