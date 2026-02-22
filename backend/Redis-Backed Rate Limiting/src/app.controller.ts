import { Controller, Get, Post, Req, UseGuards } from "@nestjs/common";

@Controller("api")
export class AppController {
  @Get("health")
  getHealth() {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  @Post("auth/login")
  login(@Req() req: any) {
    return { message: "Login endpoint", ip: req.ip };
  }

  @Get("transactions")
  getTransactions() {
    return { transactions: [], message: "Transactions endpoint" };
  }

  @Get("admin/stats")
  getAdminStats(@Req() req: any) {
    // Simulate admin endpoint - in real app, check req.user.role
    return { stats: {}, message: "Admin stats endpoint" };
  }
}
