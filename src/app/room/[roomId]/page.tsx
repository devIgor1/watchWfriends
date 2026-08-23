import { notFound } from "next/navigation";
import { RoomExperience } from "@/components/room-experience";
import { isValidRoomId, normalizeRoomId } from "@/lib/room";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId: rawRoomId } = await params;
  const roomId = normalizeRoomId(rawRoomId);

  if (!isValidRoomId(roomId)) {
    notFound();
  }

  return <RoomExperience roomId={roomId} />;
}
