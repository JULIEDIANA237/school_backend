import bcrypt from "bcryptjs";
import User from "./user.model";

export default async function seedUsers() {
  const users = [
    {
      email: "admin@school.com",
      password: "admin123",
      firstName: "System",
      lastName: "Admin",
      role: "admin",
    },
    {
      email: "teacher@school.com",
      password: "teacher123",
      firstName: "John",
      lastName: "Doe",
      role: "teacher",
    },
    {
      email: "parent@school.com",
      password: "parent123",
      firstName: "Jane",
      lastName: "Parent",
      role: "parent",
    },
  ];

  for (const user of users) {
    const exists = await User.findOne({ email: user.email });
    if (exists) continue;

    const hashedPassword = await bcrypt.hash(user.password, 10);

    await User.create({
      ...user,
      password: hashedPassword,
    });
  }

  console.log("👤 Users seeded");
}
