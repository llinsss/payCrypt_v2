import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/services/api_service.dart';

/// Represents the priority level of a support ticket.
enum TicketPriority { low, medium, high }

/// Represents the current status of a support ticket.
enum TicketStatus { open, inProgress, resolved, closed }

/// Maps issue category labels to their API-safe string values.
const Map<String, String> kIssueTypeValues = {
  'Failed Transaction': 'failed_transaction',
  'KYC / Verification': 'kyc_verification',
  'Deposit Issue': 'deposit_issue',
  'Withdrawal Issue': 'withdrawal_issue',
  'Account Access': 'account_access',
  'Other': 'other',
};

/// A single support ticket as returned by the API.
class SupportTicket {
  final String id;
  final String subject;
  final String description;
  final String issueType;
  final TicketStatus status;
  final TicketPriority priority;
  final String? linkedTransactionId;
  final DateTime createdAt;
  final DateTime updatedAt;

  SupportTicket({
    required this.id,
    required this.subject,
    required this.description,
    required this.issueType,
    required this.status,
    required this.priority,
    this.linkedTransactionId,
    required this.createdAt,
    required this.updatedAt,
  });

  factory SupportTicket.fromJson(Map<String, dynamic> json) {
    return SupportTicket(
      id: (json['id'] ?? '').toString(),
      subject: json['subject'] as String? ?? '',
      description: json['description'] as String? ?? '',
      issueType: json['issue_type'] as String? ?? 'other',
      status: _parseStatus(json['status'] as String? ?? 'open'),
      priority: _parsePriority(json['priority'] as String? ?? 'medium'),
      linkedTransactionId: json['transaction_id'] as String?,
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'].toString()) ?? DateTime.now()
          : DateTime.now(),
      updatedAt: json['updated_at'] != null
          ? DateTime.tryParse(json['updated_at'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  static TicketStatus _parseStatus(String status) {
    switch (status) {
      case 'in_progress':
        return TicketStatus.inProgress;
      case 'resolved':
        return TicketStatus.resolved;
      case 'closed':
        return TicketStatus.closed;
      default:
        return TicketStatus.open;
    }
  }

  static TicketPriority _parsePriority(String priority) {
    switch (priority) {
      case 'high':
        return TicketPriority.high;
      case 'low':
        return TicketPriority.low;
      default:
        return TicketPriority.medium;
    }
  }

  String get statusLabel {
    switch (status) {
      case TicketStatus.open:
        return 'Open';
      case TicketStatus.inProgress:
        return 'In Progress';
      case TicketStatus.resolved:
        return 'Resolved';
      case TicketStatus.closed:
        return 'Closed';
    }
  }

  String get priorityLabel {
    switch (priority) {
      case TicketPriority.high:
        return 'High';
      case TicketPriority.medium:
        return 'Medium';
      case TicketPriority.low:
        return 'Low';
    }
  }
}

/// Service for creating and retrieving support tickets via the backend API.
/// Falls back gracefully when the support-tickets endpoint is not yet live.
class SupportTicketService {
  SupportTicketService({ApiService? apiService})
      : _apiService = apiService ?? locator<ApiService>();

  final ApiService _apiService;

  static const String _endpoint = '/support-tickets';

  /// Submit a new support ticket.
  ///
  /// Returns the created [SupportTicket] on success.
  /// Throws an [Exception] on failure.
  Future<SupportTicket> createTicket({
    required String subject,
    required String description,
    required String issueType,
    String? linkedTransactionId,
    TicketPriority priority = TicketPriority.medium,
  }) async {
    final body = <String, dynamic>{
      'subject': subject.trim(),
      'description': description.trim(),
      'issue_type': issueType,
      'priority': _priorityValue(priority),
    };

    if (linkedTransactionId != null && linkedTransactionId.trim().isNotEmpty) {
      body['transaction_id'] = linkedTransactionId.trim();
    }

    final response = await _apiService.post(_endpoint, body);

    final data = response is Map<String, dynamic>
        ? (response['data'] ?? response) as Map<String, dynamic>
        : response as Map<String, dynamic>;

    return SupportTicket.fromJson(data);
  }

  /// Fetch the list of support tickets for the authenticated user.
  ///
  /// Returns an empty list if the endpoint is unavailable.
  Future<List<SupportTicket>> getTickets({
    int limit = 20,
    int offset = 0,
  }) async {
    try {
      final response = await _apiService
          .get('$_endpoint?limit=$limit&offset=$offset');

      if (response is List) {
        return response
            .whereType<Map<String, dynamic>>()
            .map(SupportTicket.fromJson)
            .toList();
      }

      if (response is Map<String, dynamic>) {
        final list = response['data'] ?? response['tickets'] ?? [];
        if (list is List) {
          return list
              .whereType<Map<String, dynamic>>()
              .map(SupportTicket.fromJson)
              .toList();
        }
      }

      return [];
    } catch (_) {
      // Endpoint may not exist yet — return empty list rather than crashing.
      return [];
    }
  }

  /// Fetch a single ticket by its ID.
  Future<SupportTicket?> getTicketById(String id) async {
    try {
      final response = await _apiService.get('$_endpoint/$id');
      final data = response is Map<String, dynamic>
          ? (response['data'] ?? response) as Map<String, dynamic>
          : response as Map<String, dynamic>;
      return SupportTicket.fromJson(data);
    } catch (_) {
      return null;
    }
  }

  static String _priorityValue(TicketPriority priority) {
    switch (priority) {
      case TicketPriority.high:
        return 'high';
      case TicketPriority.low:
        return 'low';
      default:
        return 'medium';
    }
  }
}
