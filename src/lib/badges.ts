export type BadgeCategory = "basic" | "fun" | "hidden";

export interface BadgeMeta {
  id: string;
  name: string;
  emoji: string;
  description: string;
  category: BadgeCategory;
  hidden?: boolean;
}

export const BADGES: BadgeMeta[] = [
  // basic
  { id: "first_login", name: "첫 발자국", emoji: "🐣", description: "첫 로그인", category: "basic" },
  { id: "first_message", name: "한마디 시작", emoji: "✏️", description: "첫 흔적 남기기", category: "basic" },
  { id: "first_post", name: "글쓴이", emoji: "📝", description: "게시판 첫 글 작성", category: "basic" },
  { id: "comment_10", name: "수다쟁이", emoji: "💬", description: "댓글 10개 달성", category: "basic" },
  { id: "comment_50", name: "말많은 모험가", emoji: "💬💬", description: "댓글 50개 달성", category: "basic" },
  { id: "comment_100", name: "전설의 수다꾼", emoji: "💬💬💬", description: "댓글 100개 달성", category: "basic" },
  { id: "first_photo", name: "사진작가", emoji: "📸", description: "사진 첫 업로드", category: "basic" },
  { id: "photo_10", name: "추억 수집가", emoji: "📸📸", description: "사진 10개 업로드", category: "basic" },
  { id: "first_profile", name: "집들이", emoji: "🏠", description: "미니홈피 프로필 첫 등록", category: "basic" },
  { id: "first_bgm", name: "DJ", emoji: "🎵", description: "배경음악 첫 설정", category: "basic" },
  { id: "guestbook_10", name: "방명록 여행자", emoji: "✍️", description: "방명록 10개 남기기", category: "basic" },
  { id: "guestbook_30", name: "방명록 순례자", emoji: "✍️✍️", description: "방명록 30개 남기기", category: "basic" },
  { id: "first_adventure", name: "모험 기록가", emoji: "⚔️", description: "모험 기록 첫 작성", category: "basic" },
  { id: "adventure_10", name: "역사의 증인", emoji: "⚔️⚔️", description: "모험 기록 10개 작성", category: "basic" },
  { id: "attend_7", name: "출석왕", emoji: "📅", description: "7일 연속 출석", category: "basic" },
  { id: "attend_30", name: "개근상", emoji: "📅📅", description: "30일 연속 출석", category: "basic" },
  { id: "attend_100", name: "전설의 개근", emoji: "📅📅📅", description: "100일 연속 출석", category: "basic" },

  // fun
  { id: "night_owl", name: "올빼미", emoji: "🦉", description: "새벽 3시~5시에 활동", category: "fun" },
  { id: "early_bird", name: "얼리버드", emoji: "🌅", description: "오전 6시~7시에 활동", category: "fun" },
  { id: "halloween", name: "할로윈 유령", emoji: "🎃", description: "10월 31일에 활동", category: "fun" },
  { id: "christmas", name: "산타", emoji: "🎄", description: "12월 25일에 활동", category: "fun" },
  { id: "lol_master", name: "ㅋㅋ장인", emoji: "🗣️", description: "ㅋ를 100개 이상 쓴 댓글 작성", category: "fun" },
  { id: "lol_500", name: "폭소", emoji: "😂", description: "ㅋ를 총 500개 사용", category: "fun" },
  { id: "novelist", name: "소설가", emoji: "📖", description: "댓글 한 개에 200자 이상", category: "fun" },
  { id: "one_char", name: "한글자", emoji: "🔤", description: "댓글 딱 1글자", category: "fun" },
  { id: "repeat_visit", name: "도돌이표", emoji: "🔁", description: "같은 날 같은 사람 방명록 3번", category: "fun" },
  { id: "guild_name", name: "새벽빛의 아이", emoji: "🌙", description: "'새벽빛' 포함 댓글 작성", category: "fun" },
  { id: "point_100", name: "포인트 부자", emoji: "💯", description: "포인트 100점 달성", category: "fun" },
  { id: "point_500", name: "포인트 왕", emoji: "👑", description: "포인트 500점 달성", category: "fun" },
  { id: "profile_change_5", name: "변신술사", emoji: "🎭", description: "프로필 사진 5번 변경", category: "fun" },
  { id: "profile_change_20", name: "만능 변장", emoji: "🎭🎭", description: "프로필 사진 20번 변경", category: "fun" },
  { id: "status_10", name: "한마디 장인", emoji: "🎤", description: "한마디 10번 변경", category: "fun" },
  { id: "all_moods", name: "무드메이커", emoji: "🌈", description: "감정 상태 모든 종류 한 번씩 설정", category: "fun" },
  { id: "bgm_change_5", name: "음악 감독", emoji: "🎵🎵", description: "배경음악 5번 변경", category: "fun" },
  { id: "speed_run", name: "스피드런", emoji: "🏃", description: "가입 후 1시간 내 댓글+방명록+사진 모두", category: "fun" },
  { id: "all_guestbook", name: "세계여행자", emoji: "🌍", description: "모든 길드원 미니홈피에 방명록", category: "fun" },
  { id: "read_20", name: "다독왕", emoji: "📚", description: "게시판 글 20개 읽기", category: "fun" },
  { id: "all_in_one", name: "올인원", emoji: "🎯", description: "하루에 출석+댓글+방명록+사진+게시글 모두", category: "fun" },
  { id: "night_guard", name: "새벽빛 수호자", emoji: "🌙🌙", description: "새벽 3~5시에 10일 이상 활동", category: "fun" },
  { id: "point_1000", name: "다이아", emoji: "💎", description: "포인트 1000점 달성", category: "fun" },
  { id: "streak_3", name: "연속 활동", emoji: "🔥", description: "3일 연속 댓글", category: "fun" },
  { id: "streak_7", name: "불꽃", emoji: "🔥🔥", description: "7일 연속 댓글", category: "fun" },
  { id: "streak_14", name: "대화재", emoji: "🔥🔥🔥", description: "14일 연속 댓글", category: "fun" },
  { id: "social_10", name: "친목왕", emoji: "🤝", description: "10명 이상 다른 길드원에게 방명록", category: "fun" },
  { id: "tagged_5", name: "포토제닉", emoji: "📷", description: "앨범에 출연자로 5번 태그", category: "fun" },
  { id: "photographer_5", name: "감독님", emoji: "🎬", description: "앨범 촬영자로 5번 등록", category: "fun" },
  { id: "cool_mood", name: "쿨가이", emoji: "😎", description: "감정을 😎로 설정", category: "fun" },
  { id: "love_mood", name: "사랑꾼", emoji: "🥰", description: "감정을 🥰로 설정", category: "fun" },
  { id: "sleepy_3days", name: "잠꾸러기", emoji: "💤", description: "😴를 3일 연속 설정", category: "fun" },
  { id: "day_100", name: "기념일", emoji: "🗓️", description: "가입 후 정확히 100일째 활동", category: "fun" },

  // hidden
  { id: "hidden_explorer", name: "탐험가", emoji: "🗺️", description: "모든 길드원 미니홈피 방문", category: "hidden", hidden: true },
  { id: "hidden_first_guest", name: "첫 손님", emoji: "🥇", description: "누군가의 미니홈피에 첫 번째 방명록", category: "hidden", hidden: true },
  { id: "hidden_allnight", name: "밤샘", emoji: "🌃", description: "자정~새벽 5시 채팅 10개", category: "hidden", hidden: true },
  { id: "hidden_spam", name: "도배왕", emoji: "⚡", description: "채팅 1분 내 5개", category: "hidden", hidden: true },
  { id: "hidden_admin", name: "비밀의 방", emoji: "🔑", description: "비밀 페이지 접속", category: "hidden", hidden: true },
  { id: "hidden_30days", name: "고인물", emoji: "🏛️", description: "가입 후 30일 경과", category: "hidden", hidden: true },
  { id: "hidden_100days", name: "화석", emoji: "🦴", description: "가입 후 100일 경과", category: "hidden", hidden: true },
  { id: "hidden_quick_read", name: "길드 마스터의 눈", emoji: "👀", description: "공지 올라온 지 1분 내 읽기", category: "hidden", hidden: true },
  { id: "hidden_first_chat", name: "떡밥 수거반", emoji: "🎙️", description: "채팅에서 첫 메시지", category: "hidden", hidden: true },
  { id: "hidden_time_travel", name: "시간여행자", emoji: "⏰", description: "모험 기록에 1년 전 날짜 입력", category: "hidden", hidden: true },
];

export const BADGE_BY_ID: Record<string, BadgeMeta> = Object.fromEntries(
  BADGES.map((b) => [b.id, b]),
);
