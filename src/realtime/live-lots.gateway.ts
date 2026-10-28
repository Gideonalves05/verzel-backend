import { Logger, OnModuleInit } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { LiveEventsService } from './live-events.service';
import { JwtPayload } from '../auth/jwt.strategy';

type AuthedSocket = Socket & { data: { user?: JwtPayload } };

@WebSocketGateway({
  namespace: '/live-lots',
  cors: {
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
  },
})
export class LiveLotsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  private readonly logger = new Logger(LiveLotsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly events: LiveEventsService,
    private readonly jwt: JwtService,
  ) {}

  onModuleInit() {
    this.events.register({
      onBidPlaced: (ev) => {
        const room = `lot:${ev.lot_id}`;
        this.server.to(room).emit('bid.placed', ev);
        if (ev.extended) {
          this.server.to(room).emit('lot.extended', {
            lot_id: ev.lot_id,
            new_ends_at: ev.new_ends_at,
            reason: 'anti-sniping',
          });
        }
        this.notifyUser(ev.leader_user_id, 'you.winning', {
          lot_id: ev.lot_id,
          current_amount_cents: ev.amount_cents,
          current_leader: true,
        });
        if (ev.previous_leader_user_id) {
          this.notifyUser(ev.previous_leader_user_id, 'you.outbid', {
            lot_id: ev.lot_id,
            current_amount_cents: ev.amount_cents,
            current_leader: false,
          });
        }
      },
      onLotEnded: (ev) => {
        const room = `lot:${ev.lot_id}`;
        const broadcast = {
          lot_id: ev.lot_id,
          winner_handle: ev.winner_handle,
          final_amount_cents: ev.final_amount_cents,
          settled_at: ev.settled_at,
        };
        this.server.to(room).emit('lot.ended', broadcast);
        if (ev.winner_user_id && ev.receipt_token) {
          this.notifyUser(ev.winner_user_id, 'lot.ended', {
            ...broadcast,
            receipt_token: ev.receipt_token,
          });
        }
      },
    });
  }

  handleConnection(client: AuthedSocket) {
    const token =
      (client.handshake.auth?.token as string | undefined) ||
      (client.handshake.query?.token as string | undefined);
    if (token) {
      try {
        const payload = this.jwt.verify<JwtPayload>(token);
        client.data.user = payload;
      } catch {
        // treat as anonymous
      }
    }
  }

  handleDisconnect(_client: AuthedSocket) {
    // no-op
  }

  @SubscribeMessage('join')
  onJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { lot_id?: string },
  ) {
    if (!body?.lot_id) return { ok: false };
    client.join(`lot:${body.lot_id}`);
    const user = client.data.user;
    if (user) {
      client.join(`user:${user.sub}`);
    }
    return { ok: true };
  }

  @SubscribeMessage('leave')
  onLeave(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { lot_id?: string },
  ) {
    if (!body?.lot_id) return { ok: false };
    client.leave(`lot:${body.lot_id}`);
    return { ok: true };
  }

  private notifyUser(userId: string, event: string, payload: unknown) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }
}
