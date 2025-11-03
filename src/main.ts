import { RoomConfiguration } from '@livekit/protocol';
import { AccessToken } from 'livekit-server-sdk';

type TokenRequest = {
  room_name?: string;
  participant_name?: string;
  participant_identity?: string;
  participant_metadata?: string; // JSON string
  participant_attributes?: Record<string, string>;
  room_config?: ReturnType<RoomConfiguration['toJson']>;

  // Back-compat aliases
  roomName?: string;
  participantName?: string;
};

function parseRoleFromMetadata(metaStr?: string): 'host' | 'listener' | undefined {
  if (!metaStr) return undefined;
  try {
    const obj = JSON.parse(metaStr);
    const role = obj?.role;
    if (role === 'host' || role === 'listener') return role;
  } catch {
    // ignore parse errors; treat as no role
  }
  return undefined;
}

async function createToken(request: TokenRequest, apiKey: string, apiSecret: string) {
  const roomName = request.room_name ?? request.roomName!;
  const participantName = request.participant_name ?? request.participantName!;

  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantName,
    ttl: '10m',
  });

  // Role-aware grant: default to listener if not specified
  const role = parseRoleFromMetadata(request.participant_metadata);
  const isHost = role === 'host';

  // Baseline grants for everyone: join, subscribe, publish data
  // livekit-server-sdk v2 no longer exports VideoGrant; pass a plain object instead
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
    // Enable RTP track publishing only for host role (you can loosen if needed)
    canPublish: !!isHost,
  });

  if (request.participant_identity) {
    at.identity = request.participant_identity;
  }
  if (request.participant_metadata) {
    at.metadata = request.participant_metadata; // keep JSON string as metadata
  }
  if (request.participant_attributes) {
    at.attributes = request.participant_attributes;
  }
  if (request.room_config) {
    at.roomConfig = RoomConfiguration.fromJson(request.room_config);
  }

  return at.toJwt();
}
export default async ({ req, res, log, error }: any) => {
  try {
    log('Creating LiveKit token...');

    // Get environment variables
    const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
    const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
    const LIVEKIT_URL = process.env.LIVEKIT_URL;

    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
      error('Missing required environment variables');
      return res.json(
        {
          error:
            'Server configuration error. Please set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL.',
        },
        500
      );
    }

    const requestBody = req.body ? JSON.parse(req.body) : {};

    // Support multiple field names for compatibility with different clients
    const room =
      requestBody.room ??
      requestBody.roomName ??
      requestBody.room_name ??
      `room-${crypto.randomUUID()}`;

    const identity =
      requestBody.identity ??
      requestBody.participantName ??
      requestBody.participant_name ??
      `user-${crypto.randomUUID()}`;

    // Expecting something like { role: 'host' | 'listener', ... }
    // We’ll stringify so it’s set into the token metadata
    const metadata = requestBody.metadata;

    const tokenRequest: TokenRequest = {
      roomName: room,
      participantName: identity,
      participant_metadata: metadata ? JSON.stringify(metadata) : undefined,
      // You may also forward participant_identity/attributes/room_config if you need them
    };

    const token = await createToken(tokenRequest, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

    log(`Token created for room: ${room}, participant: ${identity}`);

    return res.json({
      token,
      server_url: LIVEKIT_URL,
    });
  } catch (err: any) {
    error('Error generating token:', err);
    return res.json(
      {
        error: 'Generating token failed',
        message: err?.message ?? 'Unknown error',
      },
      500
    );
  }
};