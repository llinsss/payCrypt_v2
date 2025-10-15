class User {
  final int id;
  final String email;
  final String tag;
  final String address;
  final String role;

  User({
    required this.id,
    required this.email,
    required this.tag,
    required this.address,
    required this.role,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] ?? 0,
      email: json['email'] ?? '',
      tag: json['tag'] ?? '',
      address: json['address'] ?? '',
      role: json['role'] ?? '',
    );
  }

  @override
  String toString() {
    return 'User{id: $id, email: $email, tag: "$tag", address: $address, role: $role}';
  }
}
