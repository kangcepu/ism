class UserProfile {
  const UserProfile({
    required this.id,
    required this.username,
    required this.fullName,
    required this.role,
    required this.gaRole,
    this.email,
  });

  final int id;
  final String username;
  final String fullName;
  final String role;
  final String gaRole;
  final String? email;

  bool get isAdmin => role == 'admin';
  bool get isGaUser => !isAdmin && gaRole != 'none';

  factory UserProfile.fromJson(Map<String, dynamic> json) => UserProfile(
    id: (json['id'] as num?)?.toInt() ?? 0,
    username: json['username']?.toString() ?? '',
    fullName:
        json['fullname']?.toString() ??
        json['full_name']?.toString() ??
        json['username']?.toString() ??
        '',
    role: json['role']?.toString() ?? 'user',
    gaRole: json['gaRole']?.toString() ?? json['ga_role']?.toString() ?? 'none',
    email: json['email']?.toString(),
  );
}
