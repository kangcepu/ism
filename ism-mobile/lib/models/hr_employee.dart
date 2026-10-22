class HrEmployee {
  const HrEmployee({
    required this.fullname,
    required this.employeeCode,
    required this.company,
  });

  final String fullname;
  final String employeeCode;
  final String company;

  factory HrEmployee.fromJson(Map<String, dynamic> json) => HrEmployee(
    fullname: json['fullname']?.toString() ?? '',
    employeeCode: json['employee_code']?.toString() ?? '',
    company: json['company']?.toString() ?? '',
  );

  String get subtitle => [
    if (employeeCode.isNotEmpty) employeeCode,
    if (company.isNotEmpty) company,
  ].join(' · ');
}
