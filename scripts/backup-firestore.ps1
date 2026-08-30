[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^gs://[a-z0-9._-]+(?:/.+)?$')]
  [string]$Destination,

  [string]$ProjectId = $env:FIREBASE_PROJECT_ID,
  [string]$DatabaseId = $env:FIRESTORE_DATABASE_ID
)

$ErrorActionPreference = 'Stop'

if (-not $ProjectId) {
  throw 'Thiếu FIREBASE_PROJECT_ID hoặc tham số -ProjectId.'
}
if (-not $DatabaseId) {
  throw 'Thiếu FIRESTORE_DATABASE_ID hoặc tham số -DatabaseId.'
}
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw 'Không tìm thấy gcloud CLI. Hãy cài Google Cloud CLI và đăng nhập service account backup.'
}

$stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH-mm-ssZ')
$target = "$($Destination.TrimEnd('/'))/$stamp"

Write-Host "Bắt đầu Firestore export tới $target"
& gcloud firestore export $target --project=$ProjectId --database=$DatabaseId --async
if ($LASTEXITCODE -ne 0) {
  throw "Firestore export thất bại với mã $LASTEXITCODE."
}

Write-Host 'Đã gửi tác vụ backup. Theo dõi trạng thái trong Google Cloud Console > Firestore > Import/Export.'
