import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainError } from '../common/filters/http-exception.filter';
import { randomGlobalHandle } from '../common/anon-handle';
import type { JwtPayload } from './jwt.strategy';
import type { LoginDto, RegisterDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new DomainError('email_taken', 'Email is already registered', 409);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const handle = await this.pickHandle(dto.role);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        role: dto.role,
        handle,
        wallet:
          dto.role === UserRole.bidder
            ? { create: {} }
            : undefined,
      },
    });
    return this.toUserDto(user);
  }

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new DomainError(
        'invalid_credentials',
        'Invalid email or password',
        401,
      );
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new DomainError(
        'invalid_credentials',
        'Invalid email or password',
        401,
      );
    }
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      handle: user.handle,
    };
    const access_token = await this.jwt.signAsync(payload);
    return {
      access_token,
      token_type: 'Bearer',
      expires_in: 86400,
      user: this.toUserDto(user),
    };
  }

  private toUserDto(user: {
    id: string;
    email: string;
    role: UserRole;
    handle: string;
  }) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      handle: user.handle,
    };
  }

  private async pickHandle(role: UserRole): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = randomGlobalHandle(role);
      const exists = await this.prisma.user.findUnique({
        where: { handle: candidate },
      });
      if (!exists) return candidate;
    }
    throw new Error('Could not generate a unique handle');
  }
}
