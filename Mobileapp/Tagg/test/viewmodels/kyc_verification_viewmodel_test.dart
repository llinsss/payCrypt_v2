import 'package:flutter_test/flutter_test.dart';
import 'package:Tagg/app/app.locator.dart';

import '../helpers/test_helpers.dart';

void main() {
  group('KycVerificationViewModel Tests -', () {
    setUp(() => registerServices());
    tearDown(() => locator.reset());
  });
}
