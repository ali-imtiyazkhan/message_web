import mongoose from "mongoose";
import cloudinary from "../config/cloudinary.config";
import ChatModel from "../models/chat.model";
import MessageModel from "../models/message.model";
import { BadRequestException, NotFoundException } from "../utils/app-error";
import { emitLastMessageToParticipants, emitNewMessageToChatRoom } from "../lib/socket";

export const sendMessageService = async (
  userId: string,
  body: { chatId: string; content?: string; image?: string; replyToId?: string }
) => {
  const { chatId, content, image, replyToId } = body;

  if (!mongoose.Types.ObjectId.isValid(chatId)) {
    throw new BadRequestException("Invalid chatId");
  }

  const chat = await ChatModel.findOne({ _id: chatId, participants: { $in: [userId] } });
  if (!chat) throw new BadRequestException("Chat not found or unauthorized");

  if (replyToId) {
    const replyMessage = await MessageModel.findOne({ _id: replyToId, chatId });
    if (!replyMessage) throw new NotFoundException("Reply message not found");
  }

  let imageUrl;
  if (image) {
    const uploadRes = await cloudinary.uploader.upload(image);
    imageUrl = uploadRes.secure_url;
  }

  const newMessage = await MessageModel.create({
    chatId,
    sender: userId,
    content,
    image: imageUrl,
    replyTo: replyToId || null,
  });

  await newMessage.populate([
    { path: "sender", select: "name avatar" },
    { path: "replyTo", select: "content image sender", populate: { path: "sender", select: "name avatar" } },
  ]);

  chat.lastMessage = newMessage._id as mongoose.Types.ObjectId;
  await chat.save();

  const stringUserId = userId.toString();
  const stringChatId = chatId.toString();
  const allParticipantIds = chat.participants.map((id) => id.toString());

  // Emit to chat room & participants
  emitNewMessageToChatRoom(stringUserId, stringChatId, newMessage);
  emitLastMessageToParticipants(allParticipantIds, stringChatId, newMessage);

  return { userMessage: newMessage, chat };
};
