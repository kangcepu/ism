class AppConfig {
  const AppConfig._();

  static const appName = 'IS Dept';
  static const appSubtitle = 'IT Operations';
  static const baseUrl = String.fromEnvironment(
    'ISM_API_URL',
    defaultValue: 'https://is.padmoasm.com/api/v1',
  );
  static final apiRootUrl = baseUrl.replaceFirst(RegExp(r'/api/v1$'), '');
  static final webRootUrl = apiRootUrl;
  static const pollingInterval = Duration(seconds: 15);
  static const requestTimeout = Duration(seconds: 12);
  static const uploadTimeout = Duration(seconds: 60);
  static const chassisAlertThreshold = 52.0;
}
