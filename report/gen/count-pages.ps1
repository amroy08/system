$docPath = "C:\Users\sumkumar41\Music\complete-school-management-system\report\School-Management-System-Project-Report.docx"
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $doc = $word.Documents.Open($docPath)
    $doc.Repaginate()
    $pages = $doc.ComputeStatistics(2)  # wdStatisticPages
    Write-Output "Pages: $pages"
    $doc.Fields.Update() | Out-Null
    foreach ($toc in $doc.TablesOfContents) { $toc.Update() | Out-Null }
    $doc.Repaginate()
    $pages2 = $doc.ComputeStatistics(2)
    Write-Output "Pages after TOC update: $pages2"
    $doc.Save()
    $doc.Close()
    $word.Quit()
    Write-Output "TOC updated and saved"
} catch {
    Write-Output "WORD-COM-FAILED: $($_.Exception.Message)"
}
