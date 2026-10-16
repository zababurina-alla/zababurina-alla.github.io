// Ссылка на вопрос в боте (формат отдела «Бот», 16.10): https://t.me/za_control_bot?start=q_<ключ>, где ключ — первые
// 12 hex SHA-256 (UTF-8) от id вопроса. Сырой id в ссылку нельзя: у вопросов по клиенту в нём кириллица и имя клиента.
// Бот на /start q_<ключ> присылает вопрос заново с кнопками (только маме и владельцу).
import { BOT_URL } from '../config';

export async function questionKey(id: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

export async function questionBotLink(id: string): Promise<string> {
  return `${BOT_URL}?start=q_${await questionKey(id)}`;
}
