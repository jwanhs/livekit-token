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
    const body: TokenRequest = req.body ? JSON.parse(req.body) : {};
    
    // Set defaults if not provided
    body.roomName = body.roomName ?? body.room_name ?? `room-${crypto.randomUUID()}`;
    body.participantName = body.participantName ?? body.participant_name ?? `user-${crypto.randomUUID()}`;

    // Generate token
    const token = await createToken(body, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

    log(`Token created for room: ${body.roomName}, participant: ${body.participantName}`);

    return res.json({
      server_url: LIVEKIT_URL,
      participant_token: token,
    });
  } catch (err: any) {
    error('Error generating token:', err);
    return res.json({ 
      error: 'Generating token failed',
      message: err.message 
    }, 500);
  }
};
