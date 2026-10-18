import { Body, Controller, Get, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { loginSchema, signupSchema, type LoginDto, type SignupDto } from "@ubp/shared";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService
  ) {}

  @Public()
  @Post("signup")
  async signup(
    @Body(new ZodValidationPipe(signupSchema)) dto: SignupDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const { rawToken, ttlHours, user } = await this.auth.signup(dto);
    this.setSessionCookie(res, rawToken, ttlHours);
    return { user };
  }

  @Public()
  @Post("login")
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const { rawToken, ttlHours, user } = await this.auth.login(dto, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    this.setSessionCookie(res, rawToken, ttlHours);
    return { user };
  }

  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookieName = this.config.get<string>("SESSION_COOKIE_NAME", "ubp_session");
    const rawToken = req.cookies?.[cookieName];
    if (rawToken) await this.auth.logout(rawToken);
    res.clearCookie(cookieName);
    return { success: true };
  }

  @Get("me")
  async me(@CurrentUser() user: { userId: string }) {
    return this.auth.me(user.userId);
  }

  private setSessionCookie(res: Response, rawToken: string, ttlHours: number) {
    const cookieName = this.config.get<string>("SESSION_COOKIE_NAME", "ubp_session");
    res.cookie(cookieName, rawToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.get<string>("NODE_ENV") === "production",
      maxAge: ttlHours * 60 * 60 * 1000,
      path: "/",
    });
  }
}
