# Transaction Export Feature

This document describes the transaction export functionality that allows users to export their transaction history in CSV and PDF formats.

## Overview

The export system provides:
- CSV and PDF export formats
- Background processing for large datasets (>1000 transactions)
- Email notifications for completed exports
- Filtering capabilities (date range, transaction type, status, etc.)
- Secure file downloads with expiration

## API Endpoints

### Request Export
```
POST /api/exports/request
```

Request body:
```json
{
  "format": "csv" | "pdf",
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "type": "send" | "receive" | "swap",
  "status": "pending" | "completed" | "failed",
  "tokenId": 1,
  "minAmount": 10.00,
  "maxAmount": 1000.00
}
```

Response for small exports:
```json
{
  "message": "Export generated successfully",
  "downloadUrl": "/api/exports/download/transactions_123_1703123456789.csv",
  "fileSize": 1024,
  "expiresIn": "24 hours"
}
```

Response for large exports:
```json
{
  "message": "Export request queued. You will receive an email when ready.",
  "jobId": "export-job-123",
  "estimatedTime": "5-15 minutes depending on data size"
}
```

### Download Export
```
GET /api/exports/download/:fileName
```

### Check Export Status
```
GET /api/exports/status/:jobId
```

Response:
```json
{
  "jobId": "export-job-123",
  "state": "completed",
  "progress": 100,
  "data": {
    "userId": 123,
    "format": "csv",
    "filters": {...}
  }
}
```

## File Formats

### CSV Format
Contains the following columns:
- Transaction ID
- Date
- Type
- Amount
- Token
- Status
- Transaction Hash
- From
- To
- Notes
- Fee

### PDF Format
Formatted table with:
- Company header
- User information
- Transaction table
- Total count
- Generation date

## Background Processing

Large exports (>1000 transactions) are processed asynchronously using BullMQ queues:

1. Export request is queued
2. Background worker processes the export
3. Email notification is sent with download link
4. Files are stored temporarily (24 hours)

## Security

- Files are stored in a protected `exports/` directory
- Download URLs include authentication
- Files expire after 24 hours
- File paths are validated to prevent directory traversal

## Configuration

The export system uses the following configuration:
- Max transactions for immediate processing: 1000
- File expiration: 24 hours
- Worker concurrency: 2
- Queue retry attempts: 3

## Dependencies

- `csv-writer`: For CSV generation
- `pdfkit`: For PDF generation
- `bullmq`: For background job processing

## Future Enhancements

- Support for Excel format
- Scheduled recurring exports
- Export templates
- Compression for large files
- Cloud storage integration