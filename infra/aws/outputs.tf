output "employee_documents_bucket" {
  value       = aws_s3_bucket.employee_documents.bucket
  description = "Set OBJECT_STORAGE_BUCKET in the backend production environment."
}

output "database_backups_bucket" {
  value       = aws_s3_bucket.database_backups.bucket
  description = "Set BACKUP_S3_BUCKET for the scheduled PostgreSQL backup job."
}

output "employee_documents_kms_key_arn" {
  value       = aws_kms_key.employee_documents.arn
  description = "Set OBJECT_STORAGE_KMS_KEY_ID in the backend environment."
}

output "database_backups_kms_key_arn" {
  value       = aws_kms_key.database_backups.arn
  description = "Set BACKUP_KMS_KEY_ID in the scheduled backup job."
}

output "employee_document_policy_arn" {
  value       = aws_iam_policy.employee_document_storage.arn
  description = "Attach to the backend workload IAM role; do not use static AWS keys."
}

output "database_backup_writer_policy_arn" {
  value       = aws_iam_policy.database_backup_writer.arn
  description = "Attach to the scheduled backup workload IAM role."
}

output "database_backup_restore_policy_arn" {
  value       = aws_iam_policy.database_backup_restore.arn
  description = "Attach only to an authorized restore-drill workload IAM role."
}
