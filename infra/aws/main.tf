terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

resource "aws_kms_key" "employee_documents" {
  description             = "Encrypt ApexiveAI employee documents and photos"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Application = "ApexiveAI Workforce Payroll"
    DataClass   = "SensitiveEmployeeData"
  }
}

resource "aws_kms_alias" "employee_documents" {
  name          = "alias/${var.name_prefix}-employee-documents"
  target_key_id = aws_kms_key.employee_documents.key_id
}

resource "aws_kms_key" "database_backups" {
  description             = "Encrypt ApexiveAI PostgreSQL backups"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Application = "ApexiveAI Workforce Payroll"
    DataClass   = "ConfidentialBackup"
  }
}

resource "aws_kms_alias" "database_backups" {
  name          = "alias/${var.name_prefix}-database-backups"
  target_key_id = aws_kms_key.database_backups.key_id
}

resource "aws_s3_bucket" "employee_documents" {
  bucket        = var.employee_documents_bucket_name
  force_destroy = false

  tags = {
    Application = "ApexiveAI Workforce Payroll"
    DataClass   = "SensitiveEmployeeData"
  }
}

resource "aws_s3_bucket_public_access_block" "employee_documents" {
  bucket                  = aws_s3_bucket.employee_documents.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "employee_documents" {
  bucket = aws_s3_bucket.employee_documents.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "employee_documents" {
  bucket = aws_s3_bucket.employee_documents.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.employee_documents.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "employee_documents" {
  bucket = aws_s3_bucket.employee_documents.id

  depends_on = [aws_s3_bucket_versioning.employee_documents]

  rule {
    id     = "approved-employee-document-retention"
    status = "Enabled"

    filter {}

    expiration {
      days = var.employee_document_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = 1
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  rule {
    id     = "remove-expired-document-delete-markers"
    status = "Enabled"
    filter {}
    expiration {
      expired_object_delete_marker = true
    }
  }
}

resource "aws_s3_bucket_policy" "employee_documents_tls_only" {
  bucket = aws_s3_bucket.employee_documents.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource = [
        aws_s3_bucket.employee_documents.arn,
        "${aws_s3_bucket.employee_documents.arn}/*",
      ]
      Condition = {
        Bool = {
          "aws:SecureTransport" = "false"
        }
      }
    }]
  })
}

resource "aws_s3_bucket" "database_backups" {
  bucket        = var.database_backups_bucket_name
  force_destroy = false

  tags = {
    Application = "ApexiveAI Workforce Payroll"
    DataClass   = "ConfidentialBackup"
  }
}

resource "aws_s3_bucket_public_access_block" "database_backups" {
  bucket                  = aws_s3_bucket.database_backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "database_backups" {
  bucket = aws_s3_bucket.database_backups.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "database_backups" {
  bucket = aws_s3_bucket.database_backups.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.database_backups.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "database_backups" {
  bucket = aws_s3_bucket.database_backups.id

  depends_on = [aws_s3_bucket_versioning.database_backups]

  rule {
    id     = "approved-database-backup-retention"
    status = "Enabled"

    filter {}

    expiration {
      days = var.database_backup_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = 1
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  rule {
    id     = "remove-expired-backup-delete-markers"
    status = "Enabled"
    filter {}
    expiration {
      expired_object_delete_marker = true
    }
  }
}

resource "aws_s3_bucket_policy" "database_backups_tls_only" {
  bucket = aws_s3_bucket.database_backups.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource = [
        aws_s3_bucket.database_backups.arn,
        "${aws_s3_bucket.database_backups.arn}/*",
      ]
      Condition = {
        Bool = {
          "aws:SecureTransport" = "false"
        }
      }
    }]
  })
}

resource "aws_iam_policy" "employee_document_storage" {
  name        = "${var.name_prefix}-employee-document-storage"
  description = "Private employee document upload and short-lived download signing."
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.employee_documents.arn}/companies/*/employees/*/*"
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
        Resource = aws_kms_key.employee_documents.arn
      },
    ]
  })
}

resource "aws_iam_policy" "database_backup_writer" {
  name        = "${var.name_prefix}-database-backup-writer"
  description = "Upload database backups to the dedicated encrypted backup bucket."
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:AbortMultipartUpload"]
        Resource = "${aws_s3_bucket.database_backups.arn}/postgres/*"
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Encrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
        Resource = aws_kms_key.database_backups.arn
      },
    ]
  })
}

resource "aws_iam_policy" "database_backup_restore" {
  name        = "${var.name_prefix}-database-backup-restore"
  description = "Read database backups for an authorized restore drill."
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.database_backups.arn}/postgres/*"
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt", "kms:DescribeKey"]
        Resource = aws_kms_key.database_backups.arn
      },
    ]
  })
}
