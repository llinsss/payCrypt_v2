import 'package:stacked/stacked.dart';
import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/app/app.router.dart';
import 'package:Tagg/services/api_service.dart';
import 'package:stacked_services/stacked_services.dart';

class StartupViewModel extends BaseViewModel {
  final _navigationService = locator<NavigationService>();
  final _apiService = locator<ApiService>();

  // Place anything here that needs to happen before we get into the application
  Future runStartupLogic() async {
    // Initialize the API service token from storage
    await _apiService.initializeToken();

    await Future.delayed(const Duration(seconds: 3));

    // This is where you can make decisions on where your app should navigate when
    // you have custom startup logic

    _navigationService.replaceWithSigninView();
  }
}
