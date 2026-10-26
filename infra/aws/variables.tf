variable "aws_region" {
  description = "AWS region for the KMS key and private storage buckets."
  type        = string
}

variable "name_prefix" {
  description = "Lowercase prefix used in bucket and KMS resource names."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]{3,30}$", var.name_prefix))
    error_message = "name_prefix must contain 3-30 lowercase letters, digits, or hyphens."
  }
}

variable "employee_documents_bucket_name" {
  description = "Globally unique S3 bucket name dedicated to employee files."
  type        = string
}

variable "database_backups_bucket_name" {
  description = "Globally unique S3 bucket name dedicated to database backups."
  type        = string
}

variable "employee_document_retention_days" {
  description = "Approved legal retention period for employee documents and photos."
  type        = number

  validation {
    condition     = var.employee_document_retention_days >= 1 && floor(var.employee_document_retention_days) == var.employee_document_retention_days
    error_message = "employee_document_retention_days must be a positive whole number chosen to match applicable law and contract."
  }
}

variable "database_backup_retention_days" {
  description = "Approved retention period for database backups."
  type        = number

  validation {
    condition     = var.database_backup_retention_days >= 1 && floor(var.database_backup_retention_days) == var.database_backup_retention_days
    error_message = "database_backup_retention_days must be a positive whole number."
  }
}
