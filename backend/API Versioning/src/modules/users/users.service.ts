import { Injectable } from "@nestjs/common";

export interface UserV1 {
  id: number;
  name: string;
  email: string;
}

export interface UserV2 {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
}

@Injectable()
export class UsersService {
  private users: UserV2[] = [
    {
      id: 1,
      firstName: "John",
      lastName: "Doe",
      email: "john.doe@example.com",
      createdAt: "2024-01-15T10:00:00Z",
    },
    {
      id: 2,
      firstName: "Jane",
      lastName: "Smith",
      email: "jane.smith@example.com",
      createdAt: "2024-02-20T14:30:00Z",
    },
  ];

  // V1 format - backward compatibility
  findAllV1(): UserV1[] {
    return this.users.map((user) => ({
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
    }));
  }

  findOneV1(id: number): UserV1 {
    const user = this.users.find((u) => u.id === id);
    if (!user) return null;

    return {
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
    };
  }

  // V2 format - new structure
  findAllV2(): UserV2[] {
    return this.users;
  }

  findOneV2(id: number): UserV2 {
    return this.users.find((u) => u.id === id);
  }

  createV2(userData: Omit<UserV2, "id" | "createdAt">): UserV2 {
    const newUser: UserV2 = {
      id: this.users.length + 1,
      ...userData,
      createdAt: new Date().toISOString(),
    };
    this.users.push(newUser);
    return newUser;
  }
}
