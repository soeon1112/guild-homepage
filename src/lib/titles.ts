import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

export type TitleType = "front" | "back";

export type TitleWord = {
  id: string;
  word: string;
  type: TitleType;
  price: number;
};

export type TitleWordDoc = {
  word: string;
  type: TitleType;
  price: number;
  owner: string;
  purchasedMonth: string;
};

export const FRONT_WORDS: TitleWord[] = [
  { id: "front_sturdy", word: "튼튼한", type: "front", price: 10 },
  { id: "front_strong", word: "강한", type: "front", price: 10 },
  { id: "front_diligent", word: "근면한", type: "front", price: 10 },
  { id: "front_sleepless", word: "잠이 부족한", type: "front", price: 10 },
  { id: "front_bored", word: "심심한", type: "front", price: 10 },
  { id: "front_charging", word: "충전 중인", type: "front", price: 10 },
  { id: "front_drained", word: "방전된", type: "front", price: 10 },
  { id: "front_relaxed", word: "느긋한", type: "front", price: 10 },
  { id: "front_hungry", word: "배고픈", type: "front", price: 10 },
  { id: "front_sleepy", word: "졸린", type: "front", price: 10 },
  { id: "front_broke", word: "돈이 없는", type: "front", price: 10 },
  { id: "front_quiet", word: "조용한", type: "front", price: 10 },
  { id: "front_urgent", word: "급한", type: "front", price: 10 },
  { id: "front_ordinary", word: "평범한", type: "front", price: 10 },
  { id: "front_plain", word: "무난한", type: "front", price: 10 },
  { id: "front_timid", word: "소심한", type: "front", price: 10 },
  { id: "front_kind", word: "착한", type: "front", price: 10 },
  { id: "front_shy", word: "수줍은", type: "front", price: 10 },
  { id: "front_clumsy", word: "허당인", type: "front", price: 10 },
  { id: "front_easygoing", word: "털털한", type: "front", price: 10 },
  { id: "front_optimistic", word: "낙천적인", type: "front", price: 10 },
  { id: "front_pessimistic", word: "비관적인", type: "front", price: 10 },
  { id: "front_potato", word: "감자같은", type: "front", price: 10 },
  { id: "front_sweetpotato", word: "고구마같은", type: "front", price: 10 },
  { id: "front_returned", word: "복귀한", type: "front", price: 10 },
  { id: "front_flustered", word: "당황한", type: "front", price: 10 },
  { id: "front_reflecting", word: "반성하는", type: "front", price: 10 },

  { id: "front_skillful", word: "솜씨 좋은", type: "front", price: 20 },
  { id: "front_wise", word: "현명한", type: "front", price: 20 },
  { id: "front_clear_eyes", word: "맑은 눈의", type: "front", price: 20 },
  { id: "front_curious", word: "호기심 많은", type: "front", price: 20 },
  { id: "front_fearless", word: "겁이 없는", type: "front", price: 20 },
  { id: "front_vibes", word: "갬성 있는", type: "front", price: 20 },
  { id: "front_high_standard", word: "눈이 높은", type: "front", price: 20 },
  { id: "front_talkative", word: "할 말 많은", type: "front", price: 20 },
  { id: "front_trusted", word: "신뢰받는", type: "front", price: 20 },
  { id: "front_just", word: "정의로운", type: "front", price: 20 },
  { id: "front_heavy", word: "묵직한", type: "front", price: 20 },
  { id: "front_agile", word: "날렵한", type: "front", price: 20 },
  { id: "front_gentle", word: "다정한", type: "front", price: 20 },
  { id: "front_passionate", word: "열정의", type: "front", price: 20 },
  { id: "front_free", word: "자유로운", type: "front", price: 20 },
  { id: "front_lonely", word: "외로운", type: "front", price: 20 },
  { id: "front_just_woke", word: "막 깨어난", type: "front", price: 20 },
  { id: "front_diet", word: "다이어트 중인", type: "front", price: 20 },
  { id: "front_diet_quit", word: "다이어트 포기한", type: "front", price: 20 },
  { id: "front_parcel", word: "택배 기다리는", type: "front", price: 20 },
  { id: "front_lunch", word: "점심시간만 기다리는", type: "front", price: 20 },
  { id: "front_friday", word: "금요일을 기다리는", type: "front", price: 20 },
  { id: "front_monday_hate", word: "월요일이 싫은", type: "front", price: 20 },
  { id: "front_careless", word: "덜렁대는", type: "front", price: 20 },
  { id: "front_quirky", word: "엉뚱한", type: "front", price: 20 },
  { id: "front_pure", word: "순수한", type: "front", price: 20 },
  { id: "front_prickly", word: "까칠한", type: "front", price: 20 },
  { id: "front_haughty", word: "도도한", type: "front", price: 20 },
  { id: "front_4d", word: "4차원의", type: "front", price: 20 },
  { id: "front_cider", word: "사이다같은", type: "front", price: 20 },
  { id: "front_vitamin", word: "비타민같은", type: "front", price: 20 },
  { id: "front_cottoncandy", word: "솜사탕같은", type: "front", price: 20 },
  { id: "front_cool", word: "쿨한", type: "front", price: 20 },
  { id: "front_cynical", word: "시니컬한", type: "front", price: 20 },
  { id: "front_strict", word: "깐깐한", type: "front", price: 20 },
  { id: "front_heartthrob", word: "심쿵한", type: "front", price: 20 },
  { id: "front_meltdown", word: "멘붕한", type: "front", price: 20 },
  { id: "front_confused", word: "혼란스러운", type: "front", price: 20 },
  { id: "front_moved", word: "감동받은", type: "front", price: 20 },
  { id: "front_jealous", word: "질투하는", type: "front", price: 20 },
  { id: "front_envious", word: "부러운", type: "front", price: 20 },
  { id: "front_wronged", word: "억울한", type: "front", price: 20 },
  { id: "front_regretful", word: "후회하는", type: "front", price: 20 },
  { id: "front_enlightened", word: "깨달은", type: "front", price: 20 },
  { id: "front_sweet", word: "달콤한", type: "front", price: 20 },
  { id: "front_salty", word: "짭짤한", type: "front", price: 20 },
  { id: "front_sour", word: "새콤한", type: "front", price: 20 },
  { id: "front_bitter", word: "쓴맛의", type: "front", price: 20 },
  { id: "front_savory", word: "감칠맛의", type: "front", price: 20 },
  { id: "front_crispy", word: "바삭한", type: "front", price: 20 },
  { id: "front_chewy", word: "쫄깃한", type: "front", price: 20 },
  { id: "front_moist", word: "촉촉한", type: "front", price: 20 },
  { id: "front_slippery_hand", word: "손이 미끄러운", type: "front", price: 20 },
  { id: "front_escapist", word: "현실도피 중인", type: "front", price: 20 },
  { id: "front_pto", word: "연차 쓴", type: "front", price: 20 },
  { id: "front_payday", word: "월급 탄", type: "front", price: 20 },
  { id: "front_almost_quit", word: "접을뻔한", type: "front", price: 20 },
  { id: "front_whale", word: "현질한", type: "front", price: 20 },
  { id: "front_spring_day", word: "봄날의", type: "front", price: 20 },
  { id: "front_midsummer", word: "한여름의", type: "front", price: 20 },
  { id: "front_autumn_night", word: "가을밤의", type: "front", price: 20 },

  { id: "front_luxury", word: "럭셔리한", type: "front", price: 35 },
  { id: "front_dawnlight", word: "새벽빛의", type: "front", price: 35 },
  { id: "front_lucky", word: "운이 좋은", type: "front", price: 35 },
  { id: "front_temptation", word: "유혹을 이겨낸", type: "front", price: 35 },
  { id: "front_indomitable", word: "불굴의", type: "front", price: 35 },
  { id: "front_fashionable", word: "꾸밀 줄 아는", type: "front", price: 35 },
  { id: "front_leading", word: "앞서가는", type: "front", price: 35 },
  { id: "front_wind_run", word: "바람을 달리는", type: "front", price: 35 },
  { id: "front_faster", word: "빛보다 빠른", type: "front", price: 35 },
  { id: "front_caffeine", word: "카페인에 찌든", type: "front", price: 35 },
  { id: "front_legendary", word: "전설의", type: "front", price: 35 },
  { id: "front_solitary", word: "고독한", type: "front", price: 35 },
  { id: "front_radiant", word: "찬란한", type: "front", price: 35 },
  { id: "front_eternal", word: "영원한", type: "front", price: 35 },
  { id: "front_secret", word: "비밀의", type: "front", price: 35 },
  { id: "front_stealthy", word: "은밀한", type: "front", price: 35 },
  { id: "front_lethal", word: "치명적인", type: "front", price: 35 },
  { id: "front_suspicious", word: "수상한", type: "front", price: 35 },
  { id: "front_chaos", word: "혼돈의", type: "front", price: 35 },
  { id: "front_cold_blood", word: "냉혈의", type: "front", price: 35 },
  { id: "front_clock_out", word: "칼퇴하는", type: "front", price: 35 },
  { id: "front_overtime", word: "야근하는", type: "front", price: 35 },
  { id: "front_quit_dream", word: "퇴사 꿈꾸는", type: "front", price: 35 },
  { id: "front_lotto", word: "로또 꿈꾸는", type: "front", price: 35 },
  { id: "front_mystic", word: "신비로운", type: "front", price: 35 },
  { id: "front_invincible", word: "무적의", type: "front", price: 35 },
  { id: "front_overwhelming", word: "압도적인", type: "front", price: 35 },
  { id: "front_raging", word: "폭주하는", type: "front", price: 35 },
  { id: "front_strongest", word: "최강의", type: "front", price: 35 },
  { id: "front_merciless", word: "무자비한", type: "front", price: 35 },
  { id: "front_madness", word: "광기의", type: "front", price: 35 },
  { id: "front_awakened", word: "각성한", type: "front", price: 35 },
  { id: "front_transcendent", word: "초월한", type: "front", price: 35 },
  { id: "front_immortal", word: "불멸의", type: "front", price: 35 },
  { id: "front_doom", word: "파멸의", type: "front", price: 35 },
  { id: "front_starlight", word: "별빛 같은", type: "front", price: 35 },
  { id: "front_moonlit", word: "달빛 아래의", type: "front", price: 35 },
  { id: "front_petal", word: "꽃잎 같은", type: "front", price: 35 },
  { id: "front_dewy", word: "이슬 맺힌", type: "front", price: 35 },
  { id: "front_misty", word: "안개 속의", type: "front", price: 35 },
  { id: "front_sunset", word: "노을 빛의", type: "front", price: 35 },
  { id: "front_breeze", word: "바람결의", type: "front", price: 35 },
  { id: "front_wave", word: "물결 같은", type: "front", price: 35 },
  { id: "front_cloud", word: "구름 위의", type: "front", price: 35 },
  { id: "front_snowflake", word: "눈꽃 같은", type: "front", price: 35 },
  { id: "front_judging", word: "심판하는", type: "front", price: 35 },
  { id: "front_reigning", word: "군림하는", type: "front", price: 35 },
  { id: "front_chosen", word: "선택받은", type: "front", price: 35 },
  { id: "front_cursed", word: "저주받은", type: "front", price: 35 },
  { id: "front_engraved", word: "각인된", type: "front", price: 35 },
  { id: "front_fallen", word: "타락한", type: "front", price: 35 },
  { id: "front_awoken", word: "깨어난", type: "front", price: 35 },
  { id: "front_sealed", word: "봉인된", type: "front", price: 35 },
  { id: "front_forgotten", word: "잊혀진", type: "front", price: 35 },
  { id: "front_exiled", word: "추방된", type: "front", price: 35 },
  { id: "front_wandering_soul", word: "방황하는", type: "front", price: 35 },
  { id: "front_roaming", word: "떠도는", type: "front", price: 35 },
  { id: "front_hidden", word: "숨겨진", type: "front", price: 35 },
  { id: "front_sunshine", word: "햇살 같은", type: "front", price: 35 },
  { id: "front_storm", word: "폭풍 같은", type: "front", price: 35 },
  { id: "front_thunder", word: "천둥 같은", type: "front", price: 35 },
  { id: "front_typhoon", word: "태풍의", type: "front", price: 35 },
  { id: "front_spicy", word: "매운맛의", type: "front", price: 35 },
];

export const BACK_WORDS: TitleWord[] = [
  { id: "back_wanderer", word: "떠돌이", type: "back", price: 10 },
  { id: "back_citizen", word: "시민", type: "back", price: 10 },
  { id: "back_friend", word: "친구", type: "back", price: 10 },
  { id: "back_dreamer", word: "몽상가", type: "back", price: 10 },
  { id: "back_drifter", word: "방랑자", type: "back", price: 10 },
  { id: "back_worker", word: "직장인", type: "back", price: 10 },
  { id: "back_unemployed", word: "백수", type: "back", price: 10 },
  { id: "back_intern", word: "인턴", type: "back", price: 10 },
  { id: "back_parttime", word: "알바생", type: "back", price: 10 },
  { id: "back_slave", word: "노비", type: "back", price: 10 },
  { id: "back_commoner", word: "평민", type: "back", price: 10 },
  { id: "back_tenant", word: "세입자", type: "back", price: 10 },
  { id: "back_student", word: "학생", type: "back", price: 10 },
  { id: "back_neighbor", word: "이웃", type: "back", price: 10 },
  { id: "back_colleague", word: "동료", type: "back", price: 10 },
  { id: "back_resident", word: "주민", type: "back", price: 10 },
  { id: "back_passerby", word: "행인", type: "back", price: 10 },
  { id: "back_guest", word: "손님", type: "back", price: 10 },
  { id: "back_traveler", word: "나그네", type: "back", price: 10 },
  { id: "back_homegirl", word: "집순이", type: "back", price: 10 },
  { id: "back_homeboy", word: "집돌이", type: "back", price: 10 },
  { id: "back_glutton", word: "먹보", type: "back", price: 10 },
  { id: "back_sleepyhead", word: "잠꾸러기", type: "back", price: 10 },
  { id: "back_lazybones", word: "게으름뱅이", type: "back", price: 10 },
  { id: "back_coward", word: "겁쟁이", type: "back", price: 10 },
  { id: "back_crybaby", word: "울보", type: "back", price: 10 },
  { id: "back_youngest", word: "막내", type: "back", price: 10 },
  { id: "back_errand", word: "셔틀", type: "back", price: 10 },
  { id: "back_last", word: "꼴찌", type: "back", price: 10 },
  { id: "back_breadgirl", word: "빵순이", type: "back", price: 10 },
  { id: "back_breadboy", word: "빵돌이", type: "back", price: 10 },

  { id: "back_beauty", word: "미소녀", type: "back", price: 20 },
  { id: "back_gourmet", word: "미식가", type: "back", price: 20 },
  { id: "back_climber", word: "등반가", type: "back", price: 20 },
  { id: "back_adventurer", word: "모험가", type: "back", price: 20 },
  { id: "back_hunter", word: "사냥꾼", type: "back", price: 20 },
  { id: "back_butler", word: "집사", type: "back", price: 20 },
  { id: "back_solver", word: "해결사", type: "back", price: 20 },
  { id: "back_destroyer", word: "파괴자", type: "back", price: 20 },
  { id: "back_hero", word: "용사", type: "back", price: 20 },
  { id: "back_princess", word: "공주", type: "back", price: 20 },
  { id: "back_prince", word: "왕자", type: "back", price: 20 },
  { id: "back_landlord", word: "집주인", type: "back", price: 20 },
  { id: "back_noble", word: "귀족", type: "back", price: 20 },
  { id: "back_lord", word: "영주", type: "back", price: 20 },
  { id: "back_addict", word: "중독자", type: "back", price: 20 },
  { id: "back_star", word: "별", type: "back", price: 20 },
  { id: "back_teacher", word: "선생님", type: "back", price: 20 },
  { id: "back_greedy", word: "욕심쟁이", type: "back", price: 20 },
  { id: "back_grumpy", word: "심술쟁이", type: "back", price: 20 },
  { id: "back_otaku_kr", word: "덕후", type: "back", price: 20 },
  { id: "back_otaku", word: "오타쿠", type: "back", price: 20 },
  { id: "back_pro_complainer", word: "프로불편러", type: "back", price: 20 },
  { id: "back_fairy", word: "요정", type: "back", price: 20 },
  { id: "back_angel", word: "천사", type: "back", price: 20 },
  { id: "back_freelancer", word: "프리랜서", type: "back", price: 20 },
  { id: "back_mintcho", word: "민초러", type: "back", price: 20 },
  { id: "back_buumeok", word: "부먹파", type: "back", price: 20 },
  { id: "back_jjikmeok", word: "찍먹파", type: "back", price: 20 },
  { id: "back_iced_americano", word: "아아파", type: "back", price: 20 },
  { id: "back_hot_americano", word: "뜨아파", type: "back", price: 20 },
  { id: "back_class_leader", word: "반장", type: "back", price: 20 },
  { id: "back_vice_leader", word: "부반장", type: "back", price: 20 },
  { id: "back_top_student", word: "우등생", type: "back", price: 20 },
  { id: "back_model_student", word: "모범생", type: "back", price: 20 },
  { id: "back_delinquent", word: "불량학생", type: "back", price: 20 },
  { id: "back_transfer", word: "전학생", type: "back", price: 20 },
  { id: "back_leader", word: "리더", type: "back", price: 20 },
  { id: "back_brain", word: "브레인", type: "back", price: 20 },
  { id: "back_eldest_bro", word: "맏형", type: "back", price: 20 },
  { id: "back_eldest_sis", word: "맏언니", type: "back", price: 20 },
  { id: "back_tamer", word: "조련사", type: "back", price: 20 },
  { id: "back_chief", word: "대장", type: "back", price: 20 },

  { id: "back_greatsword", word: "대검전사", type: "back", price: 35 },
  { id: "back_mage", word: "마법사", type: "back", price: 35 },
  { id: "back_king", word: "왕", type: "back", price: 35 },
  { id: "back_knight", word: "기사", type: "back", price: 35 },
  { id: "back_guardian", word: "수호자", type: "back", price: 35 },
  { id: "back_healer", word: "힐러", type: "back", price: 35 },
  { id: "back_warrior", word: "전사", type: "back", price: 35 },
  { id: "back_archer", word: "궁수", type: "back", price: 35 },
  { id: "back_thief", word: "도적", type: "back", price: 35 },
  { id: "back_dancer", word: "댄서", type: "back", price: 35 },
  { id: "back_musician", word: "악사", type: "back", price: 35 },
  { id: "back_fighter", word: "격투가", type: "back", price: 35 },
  { id: "back_bard", word: "음유시인", type: "back", price: 35 },
  { id: "back_crossbow", word: "석궁사수", type: "back", price: 35 },
  { id: "back_longbow", word: "장궁병", type: "back", price: 35 },
  { id: "back_priest", word: "사제", type: "back", price: 35 },
  { id: "back_dark_mage", word: "암흑술사", type: "back", price: 35 },
  { id: "back_ice_mage", word: "빙결술사", type: "back", price: 35 },
  { id: "back_fire_mage", word: "화염술사", type: "back", price: 35 },
  { id: "back_lightning", word: "전격술사", type: "back", price: 35 },
  { id: "back_dual_blade", word: "듀얼블레이더", type: "back", price: 35 },
  { id: "back_ceo", word: "대표", type: "back", price: 35 },
  { id: "back_boss", word: "사장", type: "back", price: 35 },
  { id: "back_tycoon", word: "건물주", type: "back", price: 35 },
  { id: "back_chaebol", word: "재벌2세", type: "back", price: 35 },
  { id: "back_demon_lord", word: "마왕", type: "back", price: 35 },
  { id: "back_sage", word: "현자", type: "back", price: 35 },
  { id: "back_queen", word: "여왕", type: "back", price: 35 },
  { id: "back_general", word: "장군", type: "back", price: 35 },
  { id: "back_champion", word: "챔피언", type: "back", price: 35 },
  { id: "back_conqueror", word: "정복자", type: "back", price: 35 },
  { id: "back_ruler", word: "지배자", type: "back", price: 35 },
  { id: "back_head", word: "수장", type: "back", price: 35 },
  { id: "back_school_president", word: "전교회장", type: "back", price: 35 },

  { id: "back_owner", word: "주인", type: "back", price: 50 },
  { id: "back_teto_m", word: "테토남", type: "back", price: 50 },
  { id: "back_egen_m", word: "에겐남", type: "back", price: 50 },
  { id: "back_teto_f", word: "테토녀", type: "back", price: 50 },
  { id: "back_egen_f", word: "에겐녀", type: "back", price: 50 },
];

export const ALL_WORDS: TitleWord[] = [...FRONT_WORDS, ...BACK_WORDS];

const wordById = new Map(ALL_WORDS.map((w) => [w.id, w]));

export function getWordById(id: string): TitleWord | undefined {
  return wordById.get(id);
}

export function getWordByText(type: TitleType, text: string): TitleWord | undefined {
  const list = type === "front" ? FRONT_WORDS : BACK_WORDS;
  return list.find((w) => w.word === text);
}

export function currentMonthKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function formatTitlePrefix(front?: string, back?: string): string {
  const f = (front ?? "").trim();
  const b = (back ?? "").trim();
  if (!f || !b) return "";
  return `「${f} ${b}」`;
}

export async function seedTitleWords(): Promise<void> {
  try {
    const snap = await getDocs(collection(db, "titleWords"));
    const existing = new Map(snap.docs.map((d) => [d.id, d.data() as Partial<TitleWordDoc>]));
    const batch = writeBatch(db);
    let changes = 0;
    for (const w of ALL_WORDS) {
      const cur = existing.get(w.id);
      if (!cur) {
        batch.set(doc(db, "titleWords", w.id), {
          word: w.word,
          type: w.type,
          price: w.price,
          owner: "",
          purchasedMonth: "",
        });
        changes++;
      } else if (cur.word !== w.word || cur.price !== w.price || cur.type !== w.type) {
        batch.set(
          doc(db, "titleWords", w.id),
          { word: w.word, type: w.type, price: w.price },
          { merge: true },
        );
        changes++;
      }
    }
    if (changes === 0) return;
    await batch.commit();
  } catch (e) {
    console.error("seedTitleWords failed", e);
  }
}

const TITLE_RENAMES: Record<string, string> = {
  대표님: "대표",
  사장님: "사장",
};

export async function migrateRenamedTitles(): Promise<void> {
  try {
    const metaRef = doc(db, "titleMeta", "rename-ceo-boss-v1");
    const meta = await getDoc(metaRef);
    if (meta.exists()) return;
    const usersSnap = await getDocs(collection(db, "users"));
    const batch = writeBatch(db);
    usersSnap.forEach((u) => {
      const data = u.data() as { frontTitle?: string; backTitle?: string };
      const nextFront = data.frontTitle && TITLE_RENAMES[data.frontTitle] ? TITLE_RENAMES[data.frontTitle] : data.frontTitle;
      const nextBack = data.backTitle && TITLE_RENAMES[data.backTitle] ? TITLE_RENAMES[data.backTitle] : data.backTitle;
      const updates: Record<string, string> = {};
      if (nextFront !== data.frontTitle) updates.frontTitle = nextFront ?? "";
      if (nextBack !== data.backTitle) updates.backTitle = nextBack ?? "";
      if (Object.keys(updates).length > 0) {
        batch.set(u.ref, updates, { merge: true });
      }
    });
    batch.set(metaRef, { migratedAt: serverTimestamp() });
    await batch.commit();
  } catch (e) {
    console.error("migrateRenamedTitles failed", e);
  }
}

export async function ensureMonthlyReset(): Promise<void> {
  const key = currentMonthKey();
  try {
    const metaRef = doc(db, "titleMeta", "reset");
    const meta = await getDoc(metaRef);
    if (meta.exists() && meta.data()?.month === key) return;

    const wordsSnap = await getDocs(collection(db, "titleWords"));
    const batch = writeBatch(db);
    let touched = 0;
    wordsSnap.forEach((d) => {
      const data = d.data() as Partial<TitleWordDoc>;
      if (data.owner && data.purchasedMonth !== key) {
        batch.update(d.ref, { owner: "", purchasedMonth: "" });
        touched++;
      }
    });

    const usersSnap = await getDocs(collection(db, "users"));
    usersSnap.forEach((u) => {
      const data = u.data() as { frontTitle?: string; backTitle?: string };
      if (data.frontTitle || data.backTitle) {
        batch.set(u.ref, { frontTitle: "", backTitle: "" }, { merge: true });
        touched++;
      }
    });

    batch.set(metaRef, { month: key, resetAt: serverTimestamp() });
    if (touched > 0 || !meta.exists()) {
      await batch.commit();
    } else {
      await setDoc(metaRef, { month: key, resetAt: serverTimestamp() });
    }
  } catch (e) {
    console.error("ensureMonthlyReset failed", e);
  }
}

export type PurchaseResult =
  | { ok: true }
  | { ok: false; reason: "taken" | "no_points" | "unknown" | "error" };

export async function purchaseTitle(
  nickname: string,
  wordId: string,
): Promise<PurchaseResult> {
  const word = getWordById(wordId);
  if (!word) return { ok: false, reason: "unknown" };
  const monthKey = currentMonthKey();

  try {
    const wordRef = doc(db, "titleWords", wordId);
    const userRef = doc(db, "users", nickname);

    const previouslyOwnedId = await runTransaction(db, async (tx) => {
      const wordSnap = await tx.get(wordRef);
      const userSnap = await tx.get(userRef);
      const userData = (userSnap.exists() ? userSnap.data() : {}) as {
        points?: number;
        frontTitle?: string;
        backTitle?: string;
      };
      const userPoints = typeof userData.points === "number" ? userData.points : 0;

      const existing = (wordSnap.exists() ? wordSnap.data() : null) as
        | Partial<TitleWordDoc>
        | null;
      const takenBySomeoneElse =
        !!existing &&
        !!existing.owner &&
        existing.owner !== nickname &&
        existing.purchasedMonth === monthKey;
      if (takenBySomeoneElse) {
        throw new Error("TAKEN");
      }

      if (userPoints < word.price) {
        throw new Error("NO_POINTS");
      }

      const prevField = word.type === "front" ? "frontTitle" : "backTitle";
      const prevWordText = (userData[prevField] || "") as string;
      let prevWordId = "";
      if (prevWordText) {
        const prev = getWordByText(word.type, prevWordText);
        if (prev) prevWordId = prev.id;
      }

      if (prevWordId && prevWordId !== wordId) {
        const prevRef = doc(db, "titleWords", prevWordId);
        tx.set(
          prevRef,
          { owner: "", purchasedMonth: "", word: getWordById(prevWordId)?.word ?? "", type: word.type, price: getWordById(prevWordId)?.price ?? 0 },
          { merge: true },
        );
      }

      tx.set(
        wordRef,
        {
          word: word.word,
          type: word.type,
          price: word.price,
          owner: nickname,
          purchasedMonth: monthKey,
        },
        { merge: true },
      );

      tx.set(
        userRef,
        {
          points: increment(-word.price),
          [prevField]: word.word,
        },
        { merge: true },
      );

      return prevWordId;
    });

    void previouslyOwnedId;
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "TAKEN") return { ok: false, reason: "taken" };
    if (msg === "NO_POINTS") return { ok: false, reason: "no_points" };
    console.error("purchaseTitle failed", e);
    return { ok: false, reason: "error" };
  }
}
