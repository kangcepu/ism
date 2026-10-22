String formatBits(num? value) {
  if (value == null) return '-';
  final number = value.toDouble();
  if (number >= 1000000000) {
    return '${(number / 1000000000).toStringAsFixed(2)} Gbps';
  }
  if (number >= 1000000) return '${(number / 1000000).toStringAsFixed(2)} Mbps';
  if (number >= 1000) return '${(number / 1000).toStringAsFixed(1)} Kbps';
  return '${number.toStringAsFixed(0)} bps';
}

String formatCompactBits(num? value) {
  if (value == null) return '-';
  final number = value.toDouble();
  if (number >= 1000000000) {
    return '${(number / 1000000000).toStringAsFixed(1)}G';
  }
  if (number >= 1000000) {
    return '${(number / 1000000).toStringAsFixed(1)}M';
  }
  if (number >= 1000) return '${(number / 1000).toStringAsFixed(1)}K';
  return number.toStringAsFixed(0);
}

String formatTemperature(num? value) =>
    value == null ? '-' : '${value.toStringAsFixed(1)}°C';

String formatLatency(num? value) => value == null ? '-' : '${value.round()} ms';

String relativeTime(DateTime? value) {
  if (value == null) return 'Belum sinkron';
  final difference = DateTime.now().difference(value);
  if (difference.inSeconds < 5) return 'Baru saja';
  if (difference.inSeconds < 60) return '${difference.inSeconds} dtk lalu';
  if (difference.inMinutes < 60) return '${difference.inMinutes} mnt lalu';
  if (difference.inHours < 24) return '${difference.inHours} jam lalu';
  return '${difference.inDays} hari lalu';
}

DateTime? parseDate(dynamic value) {
  if (value == null || value.toString().isEmpty) return null;
  return DateTime.tryParse(value.toString())?.toLocal();
}
