
import { VocabularyItem } from '../types';

export const DEFAULT_USER_ID = 'u-master-learner';

/**
 * ĐƯỜNG DẪN DỮ LIỆU TỔNG HỢP:
 * Đặt file của bạn tại: public/data/data.json
 * File này có thể là Array [{}, {}] hoặc Object { "vocabulary": [], "settings": {} }
 */
export const LOCAL_SHIPPED_DATA_PATH = '/data/data.json';

/**
 * URL từ xa (GitHub) - Dùng để đồng bộ thủ công.
 */
export const REMOTE_VOCAB_URL = ''; 

/**
 * Dữ liệu dự phòng nếu không tìm thấy file data.json
 */
export const initialVocabulary: VocabularyItem[] = [
  {
    id: "fallback-1",
    userId: DEFAULT_USER_ID,
    word: "Welcome to IELTS Pro",
    ipa: "/ˈwɛlkəm/",
    meaningVi: "Chào mừng bạn",
    example: "Please put your data.json in public/data/ to see your words here.",
    note: "Dữ liệu dự phòng hệ thống.",
    tags: ["System"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nextReview: Date.now(),
    interval: 0,
    easeFactor: 2.5,
    consecutiveCorrect: 0,
    forgotCount: 0
  }
];
