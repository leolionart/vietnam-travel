import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { getDb } from './connection.js';
import { inferTransportType } from '../lib/vexere.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface LegacyLocation {
    id: number;
    name: string;
    province?: string;
    lat?: number;
    lng?: number;
    dateRange?: string;
    duration?: number;
    transport?: string;
    transportFare?: number;
    highlight?: string;
    description?: string;
    activities?: string[];
    food?: string[];
    adultPrice?: number;
    childPrice?: number;
    stayCostPerNight?: number;
    foodBudgetPerDay?: number;
    adults?: number;
    children?: number;
    accommodationName?: string;
    accommodationUrl?: string;
}

interface LegacyPlan {
    name: string;
    slug?: string;
    dateRange?: string;
    locations: LegacyLocation[];
}

// Parse "DD/MM/YYYY HH:MM" → Unix ms
function parseViDate(str: string): number | null {
    if (!str) return null;
    const trimmed = str.trim();
    // Format: "DD/MM/YYYY HH:MM"
    const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
    if (!match) return null;
    const [, d, m, y, h = '0', min = '0'] = match;
    const date = new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min));
    return Number.isNaN(date.getTime()) ? null : date.getTime();
}

// Parse "DD/MM/YYYY HH:MM - DD/MM/YYYY HH:MM" → { start, end }
function parseDateRange(dateRange: string): { start: number | null; end: number | null } {
    if (!dateRange) return { start: null, end: null };
    const parts = dateRange.split(' - ');
    return {
        start: parts[0] ? parseViDate(parts[0]) : null,
        end: parts[1] ? parseViDate(parts[1]) : null,
    };
}

interface SubLocationSeed {
    planSlug: string;
    locationName: string;
    sortOrder: number;
    name: string;
    lat: number;
    lng: number;
    durationMinutes: number;
    description: string;
    adultPrice: number;
    childPrice: number;
}

const SUB_LOCATION_SEEDS: SubLocationSeed[] = [
    // ── Nghệ An – plan-1 ─────────────────────────────────────────────────────
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Nghệ An', sortOrder: 1,  name: 'Đường bộ ven biển Nghệ An',              lat: 18.8260, lng: 105.6908, durationMinutes: 60,  description: 'Tuyến đường ven biển ngắm cảnh từ Cửa Lò đến Nghi Thiết.', adultPrice: 0, childPrice: 0 },
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Nghệ An', sortOrder: 2,  name: 'Bãi biển Cửa Lò',                         lat: 18.8167, lng: 105.7333, durationMinutes: 240, description: 'Bãi biển cát trắng dài 10km, nước trong xanh, sóng nhẹ, cách TP Vinh 16km. Bãi biển biểu tượng du lịch Bắc Trung Bộ, lý tưởng mùa hè.', adultPrice: 0, childPrice: 0 },
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Nghệ An', sortOrder: 3,  name: 'Khu Di tích Kim Liên – Làng Sen',          lat: 18.6578, lng: 105.5589, durationMinutes: 150, description: 'Di tích quê hương Chủ tịch Hồ Chí Minh, gồm Hoàng Trù (quê ngoại) và Làng Sen (quê nội). Diện tích 205ha, cách Vinh 15km. Miễn phí.', adultPrice: 0, childPrice: 0 },
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Nghệ An', sortOrder: 4,  name: 'Núi Quyết – Đền Quang Trung',              lat: 18.6667, lng: 105.6667, durationMinutes: 90,  description: 'Núi Dũng Quyết cao 97m trong lòng TP Vinh, đền thờ Hoàng đế Quang Trung. Leo 81 bậc, ngắm toàn cảnh TP Vinh và sông Lam.', adultPrice: 15000, childPrice: 15000 },
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Nghệ An', sortOrder: 5,  name: 'Bãi biển Nghi Thiết',                     lat: 18.8833, lng: 105.8333, durationMinutes: 180, description: 'Bãi đá đỏ hoang sơ tự nhiên, bãi cát mịn vắng khách cách Vinh 30km. Đặc trưng đá phong hoá màu đỏ xen vàng, thích hợp cắm trại và chụp ảnh.', adultPrice: 0, childPrice: 0 },
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Nghệ An', sortOrder: 6,  name: 'Đảo Ngư (Hòn Ngư – Song Ngư)',             lat: 18.7833, lng: 105.8167, durationMinutes: 180, description: 'Đảo cách bờ Cửa Lò 4km, bãi tắm nước trong, chùa Song Ngư cổ thời Trần, giếng ngọc 700 tuổi. Cáp treo VinWonders vượt biển.', adultPrice: 350000, childPrice: 250000 },
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Nghệ An', sortOrder: 7,  name: 'Khe Rạn – Vườn QG Pù Mát',                lat: 19.0333, lng: 104.8667, durationMinutes: 240, description: 'Thác và suối trong Vườn Quốc gia Pù Mát, huyện Con Cuông. Thác Khe Rèm là điểm chính. Cách Vinh ~120km theo QL7.', adultPrice: 30000, childPrice: 10000 },
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Nghệ An', sortOrder: 8,  name: 'Khu Di tích Truông Bồn',                  lat: 18.9833, lng: 105.3333, durationMinutes: 120, description: 'Di tích lịch sử quốc gia tưởng niệm 13 chiến sĩ TNXP hi sinh tháng 10/1968. Diện tích 22ha. Cách Vinh ~50km theo QL7.', adultPrice: 0, childPrice: 0 },
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Nghệ An', sortOrder: 9,  name: 'Đền Cờn',                                  lat: 19.2167, lng: 105.7167, durationMinutes: 90,  description: '"Nhất Cờn, nhì Quả" – đền thờ Tứ vị thánh nương thời Trần, Di tích Quốc gia 1993. Cách Vinh 75km.', adultPrice: 0, childPrice: 0 },
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Nghệ An', sortOrder: 10, name: 'Đảo Chè Thanh Chương',                     lat: 18.5167, lng: 105.2833, durationMinutes: 180, description: '420ha đồi chè xanh nổi trên mặt hồ đập Cầu Thau, "Hạ Long trên cạn". Vé thuyền ra đảo. Cách Vinh 50km.', adultPrice: 50000, childPrice: 50000 },
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Nghệ An', sortOrder: 11, name: 'Suối Nước Mọc (Tạ Bó – Yên Khê)',          lat: 19.1333, lng: 104.9167, durationMinutes: 150, description: 'Suối thiên nhiên mực nước ổn định quanh năm, mát lạnh mùa hè. Hồ bơi tự nhiên trong vắt. Cách Vinh ~130km.', adultPrice: 0, childPrice: 0 },
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Nghệ An', sortOrder: 12, name: 'Bãi Lữ',                                    lat: 18.8500, lng: 105.8000, durationMinutes: 240, description: 'Khu sinh thái 4 sao tại Nghi Yên, cách Vinh 25km. Bãi biển hoang sơ, rừng thông xanh. Được ví như "Đà Lạt trên biển".', adultPrice: 0, childPrice: 0 },
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Nghệ An', sortOrder: 13, name: 'Thành Vinh Cổ (Phượng Hoàng Trung Đô)',     lat: 18.6722, lng: 105.6778, durationMinutes: 60,  description: 'Nền móng kinh đô Phượng Hoàng Trung Đô của Vua Quang Trung khởi xây 1788. Di tích lịch sử công cộng trong lòng TP Vinh.', adultPrice: 0, childPrice: 0 },
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Nghệ An', sortOrder: 14, name: 'Đảo Chè Nghĩa Đàn – Phủ Quỳ',             lat: 19.3833, lng: 105.4333, durationMinutes: 180, description: 'Vùng đồi chè Phủ Quỳ rộng lớn tại Nghĩa Đàn, ngắm cảnh đồi chè xanh bát ngát, thăm các trang trại chè. Cách Vinh ~80km.', adultPrice: 0, childPrice: 0 },
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Nghệ An', sortOrder: 15, name: 'Suối cá Nghĩa Đàn',                        lat: 19.3500, lng: 105.4167, durationMinutes: 120, description: 'Điểm sinh thái suối cá tự nhiên tại Nghĩa Đàn, loài cá không sợ người, bơi thành đàn trong nước trong vắt.', adultPrice: 20000, childPrice: 10000 },
    // ── Ninh Bình – plan-1 ───────────────────────────────────────────────────
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Ninh Bình', sortOrder: 1, name: 'Khu DL Sinh thái Tràng An',  lat: 20.2500, lng: 105.9000, durationMinutes: 180, description: 'Di sản Văn hóa Thiên nhiên Thế giới UNESCO. Hệ thống hang động núi đá vôi, sông suối xanh biếc. Vé bao gồm đò và hướng dẫn viên.', adultPrice: 250000, childPrice: 150000 },
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Ninh Bình', sortOrder: 2, name: 'Tam Cốc – Bích Động',        lat: 20.2167, lng: 105.9167, durationMinutes: 150, description: '"Vịnh Hạ Long trên cạn" – sông Ngô Đồng uốn qua 3 hang giữa cánh đồng lúa. Thuyền chèo chân của người địa phương.', adultPrice: 120000, childPrice: 60000 },
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Ninh Bình', sortOrder: 3, name: 'Hang Múa',                   lat: 20.2333, lng: 105.9167, durationMinutes: 90,  description: '"Vạn Lý Trường Thành thu nhỏ" – leo ~500 bậc đá lên đỉnh Ngọa Long, ngắm toàn cảnh Tam Cốc và núi non Ninh Bình.', adultPrice: 100000, childPrice: 100000 },
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Ninh Bình', sortOrder: 4, name: 'Chùa Bái Đính',             lat: 20.2833, lng: 105.8667, durationMinutes: 150, description: 'Quần thể chùa lớn nhất Đông Nam Á với nhiều kỷ lục VN và châu Á. Xe điện nội khu 30k khứ hồi.', adultPrice: 50000, childPrice: 50000 },
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Ninh Bình', sortOrder: 5, name: 'Cố đô Hoa Lư',              lat: 20.2833, lng: 105.9167, durationMinutes: 90,  description: 'Kinh đô đầu tiên Việt Nam thế kỷ 10, triều Đinh – Tiền Lê. Đền Đinh Tiên Hoàng và đền Lê Đại Hành.', adultPrice: 20000, childPrice: 10000 },
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Ninh Bình', sortOrder: 6, name: 'Đầm Vân Long',              lat: 20.3667, lng: 105.8500, durationMinutes: 120, description: 'Khu bảo tồn đất ngập nước lớn nhất miền Bắc, nơi quay Kong: Skull Island. Đi thuyền ngắm núi đá, tìm voọc quần đùi trắng.', adultPrice: 100000, childPrice: 60000 },
    // ── Hạ Long – plan-1 ─────────────────────────────────────────────────────
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Hạ Long', sortOrder: 1, name: 'Vịnh Hạ Long – Tour tàu tham quan',       lat: 20.9100, lng: 107.1839, durationMinutes: 360, description: 'Di sản Thiên nhiên Thế giới UNESCO. Tuyến VHL5: Thiên Cung, Đầu Gỗ, Hòn Trống Mái. 6 giờ trên vịnh với hướng dẫn viên.', adultPrice: 310000, childPrice: 150000 },
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Hạ Long', sortOrder: 2, name: 'Sun World Hạ Long – Cáp treo Nữ Hoàng',  lat: 20.9472, lng: 107.0844, durationMinutes: 240, description: 'Cáp treo vượt biển dài nhất VN nối Bãi Cháy – đỉnh Ba Deo. Công viên Rồng, trò chơi cảm giác mạnh, biểu diễn.', adultPrice: 380000, childPrice: 280000 },
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Hạ Long', sortOrder: 3, name: 'Bãi tắm Bãi Cháy',                        lat: 20.9500, lng: 107.0667, durationMinutes: 180, description: 'Bãi biển nhân tạo đẹp nhất Hạ Long, cát trắng mịn ngay trung tâm Bãi Cháy. Tắm biển, thể thao nước, ngắm cầu Bãi Cháy.', adultPrice: 0, childPrice: 0 },
    // ── Hà Nội cuối – plan-1 ─────────────────────────────────────────────────
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Hà Nội', sortOrder: 1, name: 'Hồ Gươm – Đền Ngọc Sơn',        lat: 21.0285, lng: 105.8522, durationMinutes: 90, description: 'Trái tim Hà Nội – hồ Hoàn Kiếm huyền thoại và đền Ngọc Sơn trên đảo Ngọc. Cầu Thê Húc đỏ son, tháp Bút, tháp Rùa.', adultPrice: 50000, childPrice: 0 },
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Hà Nội', sortOrder: 2, name: 'Văn Miếu – Quốc Tử Giám',       lat: 21.0267, lng: 105.8358, durationMinutes: 90, description: 'Di tích hơn 1.000 năm – trường đại học đầu tiên VN (1076). 5 sân vườn, Khuê Văn Các, 82 bia tiến sĩ.', adultPrice: 70000, childPrice: 0 },
    { planSlug: 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi', locationName: 'Hà Nội', sortOrder: 3, name: 'Lăng Chủ tịch Hồ Chí Minh',     lat: 21.0367, lng: 105.8347, durationMinutes: 60, description: 'Quảng trường Ba Đình lịch sử. Viếng thi hài Bác. Đóng cửa thứ Hai và thứ Sáu.', adultPrice: 0, childPrice: 0 },

    // ── Đà Nẵng – plan-2 ─────────────────────────────────────────────────────
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Đà Nẵng', sortOrder: 1, name: 'Cầu Vàng – Bà Nà Hills (ngắm)',        lat: 15.9936, lng: 107.9892, durationMinutes: 60,  description: 'Cây cầu vàng biểu tượng do hai bàn tay khổng lồ đỡ ở độ cao 1.400m, nổi tiếng thế giới qua ảnh viral 2018.', adultPrice: 0, childPrice: 0 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Đà Nẵng', sortOrder: 2, name: 'Bãi biển Mỹ Khê',                       lat: 16.0471, lng: 108.2478, durationMinutes: 180, description: '"Bãi biển quyến rũ nhất hành tinh" theo Forbes. Sóng lớn phù hợp lướt ván, bờ biển cát trắng mịn dài 900m.', adultPrice: 0, childPrice: 0 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Đà Nẵng', sortOrder: 3, name: 'Ngũ Hành Sơn',                          lat: 15.9761, lng: 108.2572, durationMinutes: 150, description: '5 ngọn núi đá vôi huyền bí. Động Huyền Không, động Âm Phủ. Cáp treo lên núi Thủy Sơn.', adultPrice: 40000, childPrice: 20000 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Đà Nẵng', sortOrder: 4, name: 'Bảo tàng Chăm',                         lat: 16.0619, lng: 108.2231, durationMinutes: 90,  description: 'Bảo tàng điêu khắc Chăm lớn nhất thế giới. 2.000+ hiện vật từ thế kỷ VII–XV của vương quốc Champa.', adultPrice: 60000, childPrice: 20000 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Đà Nẵng', sortOrder: 5, name: 'Cầu Rồng – Sông Hàn buổi tối',          lat: 16.0613, lng: 108.2272, durationMinutes: 90,  description: 'Cầu phun lửa và nước mỗi tối thứ Bảy & Chủ Nhật 21:00. Đi dạo bờ Đông sông Hàn, thưởng thức ẩm thực đường phố.', adultPrice: 0, childPrice: 0 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Đà Nẵng', sortOrder: 6, name: 'Bán đảo Sơn Trà – Chùa Linh Ứng',       lat: 16.1044, lng: 108.2827, durationMinutes: 180, description: 'Khu bảo tồn thiên nhiên bán đảo Sơn Trà. Tượng Phật Quan Âm cao 67m nhìn ra vịnh Đà Nẵng. Đường lên bán đảo ngắm toàn cảnh TP.', adultPrice: 0, childPrice: 0 },

    // ── Bà Nà Hills – plan-2 ──────────────────────────────────────────────────
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Bà Nà Hills', sortOrder: 1, name: 'Vé cáp treo + Sun World Bà Nà Hills', lat: 15.9936, lng: 107.9892, durationMinutes: 480, description: 'Combo vé trọn ngày: cáp treo lên cao 1.487m, Làng Pháp, Cầu Vàng, Fantasy Park trong nhà, vườn hoa Le Jardin D\'Amour.', adultPrice: 850000, childPrice: 700000 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Bà Nà Hills', sortOrder: 2, name: 'Fantasy Park Bà Nà',                   lat: 15.9920, lng: 107.9880, durationMinutes: 120, description: 'Công viên trong nhà lớn nhất Đông Nam Á nằm trong lâu đài 3 tầng. Trò chơi kết hợp mọi lứa tuổi.', adultPrice: 0, childPrice: 0 },

    // ── Hội An – plan-2 ───────────────────────────────────────────────────────
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Hội An', sortOrder: 1, name: 'Phố Cổ Hội An',                    lat: 15.8801, lng: 108.3380, durationMinutes: 240, description: 'Di sản Văn hóa Thế giới UNESCO. Phố Hội 400 năm tuổi với đèn lồng, hội quán người Hoa, nhà cổ Tấn Ký, Chùa Cầu Nhật Bản.', adultPrice: 120000, childPrice: 60000 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Hội An', sortOrder: 2, name: 'Bãi biển An Bàng – Cửa Đại',       lat: 15.8833, lng: 108.3667, durationMinutes: 180, description: 'Bãi biển gần phố cổ Hội An nhất, nước xanh trong, vắng người hơn Mỹ Khê. Thuê ghế dù, thưởng thức hải sản.', adultPrice: 0, childPrice: 0 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Hội An', sortOrder: 3, name: 'Làng rau Trà Quế',                  lat: 15.9000, lng: 108.3333, durationMinutes: 90,  description: 'Làng rau hữu cơ 500 tuổi bên sông Đế Võng. Tham gia trải nghiệm trồng rau với người nông dân địa phương.', adultPrice: 50000, childPrice: 30000 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Hội An', sortOrder: 4, name: 'Rừng dừa Bảy Mẫu – Cẩm Thanh',     lat: 15.8583, lng: 108.3750, durationMinutes: 120, description: 'Rừng dừa 7 mẫu đất ngập nước, sinh cảnh độc đáo. Tour thúng chai xoay vòng, câu cua và ngắm đom đóm.', adultPrice: 120000, childPrice: 80000 },

    // ── Nghệ An – plan-2 ──────────────────────────────────────────────────────
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Nghệ An', sortOrder: 1,  name: 'Bãi biển Cửa Lò',                         lat: 18.8167, lng: 105.7333, durationMinutes: 240, description: 'Bãi biển cát trắng dài 10km, nước trong xanh, sóng nhẹ, cách TP Vinh 16km. Bãi biển biểu tượng du lịch Bắc Trung Bộ, lý tưởng mùa hè.', adultPrice: 0, childPrice: 0 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Nghệ An', sortOrder: 2,  name: 'Khu Di tích Kim Liên – Làng Sen',          lat: 18.6578, lng: 105.5589, durationMinutes: 150, description: 'Di tích quê hương Chủ tịch Hồ Chí Minh, gồm Hoàng Trù (quê ngoại) và Làng Sen (quê nội). Diện tích 205ha, cách Vinh 15km. Miễn phí.', adultPrice: 0, childPrice: 0 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Nghệ An', sortOrder: 3,  name: 'Núi Quyết – Đền Quang Trung',              lat: 18.6667, lng: 105.6667, durationMinutes: 90,  description: 'Núi Dũng Quyết cao 97m trong lòng TP Vinh, đền thờ Hoàng đế Quang Trung. Leo 81 bậc, ngắm toàn cảnh TP Vinh và sông Lam.', adultPrice: 15000, childPrice: 15000 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Nghệ An', sortOrder: 4,  name: 'Đảo Ngư (Hòn Ngư – Song Ngư)',             lat: 18.7833, lng: 105.8167, durationMinutes: 180, description: 'Đảo cách bờ Cửa Lò 4km, bãi tắm nước trong, chùa Song Ngư cổ thời Trần, giếng ngọc 700 tuổi. Cáp treo VinWonders vượt biển.', adultPrice: 350000, childPrice: 250000 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Nghệ An', sortOrder: 5,  name: 'Khe Rạn – Vườn QG Pù Mát',                lat: 19.0333, lng: 104.8667, durationMinutes: 240, description: 'Thác và suối trong Vườn Quốc gia Pù Mát, huyện Con Cuông. Thác Khe Rèm là điểm chính. Cách Vinh ~120km theo QL7.', adultPrice: 30000, childPrice: 10000 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Nghệ An', sortOrder: 6,  name: 'Đảo Chè Thanh Chương',                     lat: 18.5167, lng: 105.2833, durationMinutes: 180, description: '420ha đồi chè xanh nổi trên mặt hồ đập Cầu Thau, "Hạ Long trên cạn". Vé thuyền ra đảo. Cách Vinh 50km.', adultPrice: 50000, childPrice: 50000 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Nghệ An', sortOrder: 7,  name: 'Đền Cờn',                                  lat: 19.2167, lng: 105.7167, durationMinutes: 90,  description: '"Nhất Cờn, nhì Quả" – đền thờ Tứ vị thánh nương thời Trần, Di tích Quốc gia 1993. Cách Vinh 75km.', adultPrice: 0, childPrice: 0 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Nghệ An', sortOrder: 8,  name: 'Đường bộ ven biển Nghệ An',                lat: 18.8260, lng: 105.6908, durationMinutes: 60,  description: 'Tuyến đường ven biển ngắm cảnh từ Cửa Lò đến Nghi Thiết.', adultPrice: 0, childPrice: 0 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Nghệ An', sortOrder: 9,  name: 'Bãi Lữ',                                    lat: 18.8500, lng: 105.8000, durationMinutes: 240, description: 'Khu sinh thái 4 sao tại Nghi Yên, cách Vinh 25km. Bãi biển hoang sơ, rừng thông xanh. Được ví như "Đà Lạt trên biển".', adultPrice: 0, childPrice: 0 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Nghệ An', sortOrder: 10, name: 'Khu Di tích Truông Bồn',                   lat: 18.9833, lng: 105.3333, durationMinutes: 120, description: 'Di tích lịch sử quốc gia tưởng niệm 13 chiến sĩ TNXP hi sinh tháng 10/1968. Diện tích 22ha. Cách Vinh ~50km theo QL7.', adultPrice: 0, childPrice: 0 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Nghệ An', sortOrder: 11, name: 'Bãi biển Nghi Thiết',                      lat: 18.8833, lng: 105.8333, durationMinutes: 180, description: 'Bãi đá đỏ hoang sơ tự nhiên, bãi cát mịn vắng khách cách Vinh 30km.', adultPrice: 0, childPrice: 0 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Nghệ An', sortOrder: 12, name: 'Suối Nước Mọc (Tạ Bó – Yên Khê)',          lat: 19.1333, lng: 104.9167, durationMinutes: 150, description: 'Suối thiên nhiên mực nước ổn định quanh năm, mát lạnh mùa hè. Hồ bơi tự nhiên trong vắt. Cách Vinh ~130km.', adultPrice: 0, childPrice: 0 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Nghệ An', sortOrder: 13, name: 'Suối cá Nghĩa Đàn',                        lat: 19.3500, lng: 105.4167, durationMinutes: 120, description: 'Điểm sinh thái suối cá tự nhiên tại Nghĩa Đàn, loài cá không sợ người, bơi thành đàn trong nước trong vắt.', adultPrice: 20000, childPrice: 10000 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Nghệ An', sortOrder: 14, name: 'Thành Vinh Cổ (Phượng Hoàng Trung Đô)',    lat: 18.6722, lng: 105.6778, durationMinutes: 60,  description: 'Nền móng kinh đô Phượng Hoàng Trung Đô của Vua Quang Trung khởi xây 1788.', adultPrice: 0, childPrice: 0 },

    // ── Ninh Bình – plan-2 ────────────────────────────────────────────────────
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Ninh Bình', sortOrder: 1, name: 'Khu DL Sinh thái Tràng An',  lat: 20.2500, lng: 105.9000, durationMinutes: 180, description: 'Di sản Văn hóa Thiên nhiên Thế giới UNESCO. Hệ thống hang động núi đá vôi, sông suối xanh biếc. Vé bao gồm đò và hướng dẫn viên.', adultPrice: 250000, childPrice: 150000 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Ninh Bình', sortOrder: 2, name: 'Tam Cốc – Bích Động',        lat: 20.2167, lng: 105.9167, durationMinutes: 150, description: '"Vịnh Hạ Long trên cạn" – sông Ngô Đồng uốn qua 3 hang giữa cánh đồng lúa. Thuyền chèo chân của người địa phương.', adultPrice: 120000, childPrice: 60000 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Ninh Bình', sortOrder: 3, name: 'Hang Múa',                   lat: 20.2333, lng: 105.9167, durationMinutes: 90,  description: '"Vạn Lý Trường Thành thu nhỏ" – leo ~500 bậc đá lên đỉnh Ngọa Long, ngắm toàn cảnh Tam Cốc và núi non Ninh Bình.', adultPrice: 100000, childPrice: 100000 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Ninh Bình', sortOrder: 4, name: 'Chùa Bái Đính',             lat: 20.2833, lng: 105.8667, durationMinutes: 150, description: 'Quần thể chùa lớn nhất Đông Nam Á với nhiều kỷ lục VN và châu Á. Xe điện nội khu 30k khứ hồi.', adultPrice: 50000, childPrice: 50000 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Ninh Bình', sortOrder: 5, name: 'Cố đô Hoa Lư',              lat: 20.2833, lng: 105.9167, durationMinutes: 90,  description: 'Kinh đô đầu tiên Việt Nam thế kỷ 10. Đền Đinh Tiên Hoàng và đền Lê Đại Hành.', adultPrice: 20000, childPrice: 10000 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Ninh Bình', sortOrder: 6, name: 'Đầm Vân Long',              lat: 20.3667, lng: 105.8500, durationMinutes: 120, description: 'Khu bảo tồn đất ngập nước lớn nhất miền Bắc. Đi thuyền ngắm núi đá, tìm voọc quần đùi trắng.', adultPrice: 100000, childPrice: 60000 },

    // ── Hà Nội – plan-2 ───────────────────────────────────────────────────────
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Hà Nội', sortOrder: 1, name: 'Hồ Gươm – Đền Ngọc Sơn',        lat: 21.0285, lng: 105.8522, durationMinutes: 90, description: 'Trái tim Hà Nội – hồ Hoàn Kiếm huyền thoại và đền Ngọc Sơn trên đảo Ngọc. Cầu Thê Húc đỏ son, tháp Bút, tháp Rùa.', adultPrice: 50000, childPrice: 0 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Hà Nội', sortOrder: 2, name: 'Văn Miếu – Quốc Tử Giám',       lat: 21.0267, lng: 105.8358, durationMinutes: 90, description: 'Di tích hơn 1.000 năm – trường đại học đầu tiên VN (1076). 5 sân vườn, Khuê Văn Các, 82 bia tiến sĩ.', adultPrice: 70000, childPrice: 0 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Hà Nội', sortOrder: 3, name: 'Lăng Chủ tịch Hồ Chí Minh',     lat: 21.0367, lng: 105.8347, durationMinutes: 60, description: 'Quảng trường Ba Đình lịch sử. Viếng thi hài Bác. Đóng cửa thứ Hai và thứ Sáu.', adultPrice: 0, childPrice: 0 },
    { planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi', locationName: 'Hà Nội', sortOrder: 4, name: 'Phố cổ Hà Nội – 36 phố phường', lat: 21.0341, lng: 105.8502, durationMinutes: 120, description: 'Khu phố thương mại lịch sử gần nghìn năm, 36 phố nghề cổ. Phố Hàng Đào, Đồng Xuân, bia hơi Tạ Hiện.', adultPrice: 0, childPrice: 0 },
];

function seedSubLocations(): void {
    const db = getDb();

    const existing = db.prepare('SELECT COUNT(*) as count FROM sub_locations').get() as { count: number };
    if (existing.count > 0) {
        console.log('[migrate] sub_locations already has data, skipping seed.');
        return;
    }

    const insert = db.prepare(`
        INSERT INTO sub_locations (location_id, sort_order, name, lat, lng, duration_minutes, description, adult_price, child_price)
        SELECT l.id, ?, ?, ?, ?, ?, ?, ?, ?
        FROM locations l
        JOIN plans p ON l.plan_id = p.id
        WHERE p.slug = ? AND l.name = ?
        ORDER BY l.id ASC
        LIMIT 1
    `);

    const seed = db.transaction(() => {
        for (const s of SUB_LOCATION_SEEDS) {
            insert.run(s.sortOrder, s.name, s.lat, s.lng, s.durationMinutes, s.description, s.adultPrice, s.childPrice, s.planSlug, s.locationName);
        }
    });

    seed();
    console.log(`[migrate] Seeded ${SUB_LOCATION_SEEDS.length} sub-locations.`);
}

export function runMigration(): void {
    const db = getDb();

    const existing = db.prepare('SELECT COUNT(*) as count FROM plans').get() as { count: number };
    if (existing.count > 0) {
        console.log('[migrate] Plans table already has data, skipping migration.');
        seedSubLocations();
        return;
    }

    // Try multiple candidate paths:
    // - PLANS_JSON_PATH env var
    // - dev: api/src/db → ../../../plans.json (project root)
    // - prod Docker: /app/dist/db → ../../plans.json (/app/plans.json)
    const candidates = [
        process.env.PLANS_JSON_PATH,
        path.resolve(__dirname, '../../../plans.json'),
        path.resolve(__dirname, '../../plans.json'),
        path.resolve(process.cwd(), 'plans.json'),
        path.resolve(process.cwd(), '../plans.json'),
    ].filter((p): p is string => Boolean(p));

    const plansJsonPath = candidates.find(p => existsSync(p)) ?? candidates[0];
    let plansJson: Record<string, LegacyPlan>;

    try {
        const raw = readFileSync(plansJsonPath, 'utf-8');
        plansJson = JSON.parse(raw);
    } catch {
        console.warn('[migrate] Could not read plans.json, skipping migration.');
        return;
    }

    const insertPlan = db.prepare(
        'INSERT INTO plans (slug, name, date_range) VALUES (?, ?, ?)'
    );
    const insertLocation = db.prepare(`
        INSERT INTO locations (
            plan_id, sort_order, name, province, lat, lng,
            arrive_at, depart_at, duration_days,
            transport_type, transport_label, transport_fare,
            accommodation_name, accommodation_url,
            adult_price, child_price, stay_cost_per_night, food_budget_per_day,
            adults, children, highlight, description, activities, food
        ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?
        )
    `);

    const migrate = db.transaction(() => {
        let planIndex = 0;
        for (const [, plan] of Object.entries(plansJson)) {
            const slug = plan.slug || `plan-${planIndex + 1}`;
            const dateRange = plan.dateRange || '';

            const result = insertPlan.run(slug, plan.name, dateRange);
            const planId = result.lastInsertRowid as number;

            const locs = Array.isArray(plan.locations) ? plan.locations : [];
            locs.forEach((loc, idx) => {
                const { start: arriveAt, end: departAt } = parseDateRange(loc.dateRange || '');
                const transportLabel = loc.transport || '';
                const transportType = inferTransportType(transportLabel);

                insertLocation.run(
                    planId,
                    idx,
                    loc.name || '',
                    loc.province || '',
                    loc.lat ?? 0,
                    loc.lng ?? 0,
                    arriveAt,
                    departAt,
                    loc.duration ?? 0,
                    transportType,
                    transportLabel,
                    loc.transportFare ?? 0,
                    loc.accommodationName ?? '',
                    loc.accommodationUrl ?? '',
                    loc.adultPrice ?? 0,
                    loc.childPrice ?? 0,
                    loc.stayCostPerNight ?? 0,
                    loc.foodBudgetPerDay ?? 0,
                    loc.adults ?? 2,
                    loc.children ?? 0,
                    loc.highlight ?? '',
                    loc.description ?? '',
                    JSON.stringify(loc.activities ?? []),
                    JSON.stringify(loc.food ?? [])
                );
            });

            planIndex++;
        }
    });

    migrate();
    console.log(`[migrate] Migrated ${Object.keys(plansJson).length} plans from plans.json`);
    seedSubLocations();
}
