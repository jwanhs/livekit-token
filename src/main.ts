import { RoomConfiguration } from '@livekit/protocol';
import { AccessToken } from 'livekit-server-sdk';

type TokenRequest = {
  room_name?: string;
  participant_name?: string;
  participant_identity?: string;
  participant_metadata?: string;
  participant_attributes?: Record<string, string>;
  room_config?: ReturnType<RoomConfiguration['toJson']>;

  // (old fields, here for backwards compatibility)
  roomName?: string;
  participantName?: string;
};

// This function creates a token for a given room and participant
async function createToken(request: TokenRequest, apiKey: string, apiSecret: string) {
  const roomName = request.room_name ?? request.roomName!;
  const participantName = request.participant_name ?? request.participantName!;

  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantName,
    // Token to expire after 10 minutes
    ttl: '10m',
  });

  // Token permissions can be added here based on the
  // desired capabilities of the participant
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canUpdateOwnMetadata: true,
  });

  if (request.participant_identity) {
    at.identity = request.participant_identity;
  }
  if (request.participant_metadata) {
    at.metadata = request.participant_metadata;
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
      return res.json({ 
        error: 'Server configuration error. Please set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL.' 
      }, 500);
    }

    // Parse request body
    const requestBody = req.body ? JSON.parse(req.body) : {};
    
    // Support multiple field name formats for compatibility
    const room = requestBody.room ?? requestBody.roomName ?? requestBody.room_name ?? `room-${crypto.randomUUID()}`;
    const identity = requestBody.identity ?? requestBody.participantName ?? requestBody.participant_name ?? `user-${crypto.randomUUID()}`;
    const metadata = requestBody.metadata;

    // Build token request
    const tokenRequest: TokenRequest = {
      roomName: room,
      participantName: identity,
      participant_metadata: metadata ? JSON.stringify(metadata) : undefined,
    };

    // Generate token
    const token = await createToken(tokenRequest, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

    log(`Token created for room: ${room}, participant: ${identity}`);

    return res.json({
      token: token,
      server_url: LIVEKIT_URL,
    });
  } catch (err: any) {
    error('Error generating token:', err);
    return res.json({ 
      error: 'Generating token failed',
      message: err.message
    }, 500);
  }
};
