import 'package:flutter/material.dart';

import '../core/app_theme.dart';

class LoadingSkeleton extends StatefulWidget {
  const LoadingSkeleton({super.key, this.height = 96});
  final double height;

  @override
  State<LoadingSkeleton> createState() => _LoadingSkeletonState();
}

class _LoadingSkeletonState extends State<LoadingSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
    opacity: Tween(begin: .35, end: .75).animate(_controller),
    child: Container(
      height: widget.height,
      decoration: BoxDecoration(
        color: AppColors.navy800,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
    ),
  );
}
