import 'package:flutter/material.dart';

import '../core/app_config.dart';
import '../core/app_theme.dart';
import '../widgets/brand_mark.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            BrandMark(size: 68),
            SizedBox(height: 22),
            Text(
              AppConfig.appName,
              style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 22,
                letterSpacing: -.4,
              ),
            ),
            SizedBox(height: 6),
            Text(
              AppConfig.appSubtitle,
              style: TextStyle(
                color: AppColors.textMuted,
                fontSize: 12,
                letterSpacing: .6,
              ),
            ),
            SizedBox(height: 30),
            SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2.4),
            ),
          ],
        ),
      ),
    );
  }
}
