import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:Tagg/services/onboarding_service.dart';

/// First-visit dashboard coach marks (issue #451).
///
/// Shown once, the first time an authenticated user lands on the dashboard, to
/// highlight the key actions. Persisted via [OnboardingService] so it never
/// re-appears. Kept as a lightweight dialog so it needs no extra dependency.
class _CoachMark {
  final IconData icon;
  final String title;
  final String description;
  const _CoachMark({
    required this.icon,
    required this.title,
    required this.description,
  });
}

const List<_CoachMark> _marks = [
  _CoachMark(
    icon: Icons.qr_code_2,
    title: 'Fund your wallet',
    description:
        'Tap Receive to reveal your wallet QR code and add your first deposit.',
  ),
  _CoachMark(
    icon: Icons.alternate_email,
    title: 'Send with @tags',
    description:
        'Use Send to pay anyone by their @tag — no long addresses needed.',
  ),
  _CoachMark(
    icon: Icons.link,
    title: 'Multiple chains',
    description:
        'Switch between Base, Lisk, U2U, Starknet, Stellar and Flow from Assets.',
  ),
];

/// Show the dashboard coach marks if they have not been seen yet.
Future<void> maybeShowDashboardCoachMarks(BuildContext context) async {
  final seen = await OnboardingService.hasSeenCoachMarks();
  if (seen) return;
  await OnboardingService.markCoachMarksSeen();
  if (!context.mounted) return;

  await showDialog<void>(
    context: context,
    barrierDismissible: true,
    barrierColor: Colors.black.withOpacity(0.7),
    builder: (context) => Dialog(
      backgroundColor: const Color(0xFF120F21),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Welcome! Here’s the quick tour',
              style: GoogleFonts.instrumentSans(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                fontSize: 20,
              ),
            ),
            const SizedBox(height: 20),
            ..._marks.map(
              (m) => Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: const Color(0xFF6C5CE7).withOpacity(0.15),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(m.icon, color: const Color(0xFF6C5CE7)),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            m.title,
                            style: GoogleFonts.instrumentSans(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                              fontSize: 16,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            m.description,
                            style: GoogleFonts.instrumentSans(
                              color: const Color(0xFF867EA5),
                              fontWeight: FontWeight.w500,
                              fontSize: 14,
                              height: 1.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: () => Navigator.of(context).pop(),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF6C5CE7),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(48),
                  ),
                ),
                child: Text(
                  'Got it',
                  style: GoogleFonts.instrumentSans(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                    fontSize: 16,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
