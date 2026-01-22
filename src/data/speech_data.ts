
export interface Quote {
    text: string;
    author: string;
}

export const QUOTES: Quote[] = [
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
    { text: "The roots of education are bitter, but the fruit is sweet.", author: "Aristotle" },
    { text: "Limit your 'always' and your 'nevers'.", author: "Amy Poehler" },
    { text: "Learning is never done without errors and defeat.", author: "Vladimir Lenin" },
    { text: "The beautiful thing about learning is that no one can take it away from you.", author: "B.B. King" },
    { text: "Education is the most powerful weapon which you can use to change the world.", author: "Nelson Mandela" },
    { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
    { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
    { text: "Live as if you were to die tomorrow. Learn as if you were to live forever.", author: "Mahatma Gandhi" },
    { text: "Knowledge is power.", author: "Francis Bacon" },
    { text: "Wisdom begins in wonder.", author: "Socrates" },
    { text: "The expert in anything was once a beginner.", author: "Helen Hayes" },
    { text: "Language is the blood of the soul into which thoughts run and out of which they grow.", author: "Oliver Wendell Holmes" },
    { text: "A different language is a different vision of life.", author: "Federico Fellini" }
];

export const BOSS_DIALOGUE = {
    victory: {
        vi: (name: string) => `Đỉnh quá! Bạn vừa tiễn biệt **${name}** vào dĩ vãng rồi. Level up thôi! 🏆`,
        en: (name: string) => `Amazing! You just defeated **${name}**. Time to level up! 🏆`
    },
    warning: {
        vi: (name: string) => `Phía trước là boss **${name}**, đừng để nó 'hù' nhé. Chuẩn bị tinh thần và trang bị kỹ vào! ⚠️`,
        en: (name: string) => `Boss **${name}** is ahead! Don't let it scare you. Gear up and stay focused! ⚠️`
    }
};

export const LAB_ADVICE: Record<string, { vi: string[], en: string[] }> = {
    'SPEAKING': {
        vi: [
            "Cố gắng **nghĩ bằng tiếng Anh** luôn nhé, đừng dịch thầm từ tiếng Việt sang, sẽ bị khựng đấy! 🧠",
            "Mẹo nhỏ: Đừng đọc 'to' là /tu:/, hãy đọc nhẹ thành **/tə/** (weak form) để nghe tự nhiên hơn.",
            "Dùng các filler như 'Let me see...' hoặc 'That's an interesting question...' để kéo dài thời gian suy nghĩ.",
            "Nói sai một chút không sao, quan trọng là bạn vẫn giữ được nhịp điệu trôi chảy.",
            "Đừng quá áp lực về từ vựng 'khủng', dùng từ đúng ngữ cảnh mới là 'pro'.",
            "Giao tiếp bằng mắt và cười nhẹ một cái, bạn sẽ thấy tự tin hơn hẳn đấy! 😊",
            "Nếu dùng tính từ chỉ tính cách (character adjectives), hãy **mở rộng hoặc giải thích** thêm về nó để ghi điểm Lexical nhé.",
            "Mẹo Part 2: Nhìn kỹ 'thì' (tenses) trong câu hỏi cue card và lắng nghe examiner để dùng 'thì' cho chuẩn xác. ⏳",
            "Dùng **Cleft sentences** (câu chẻ) là cách tuyệt vời để nhấn mạnh ý trả lời với giám khảo đấy!",
            "Đừng lo lắng về 'um' và 'er'. Người bản xứ cũng dùng chúng để duy trì mạch nói (fluency). Đừng quá lạm dụng là được.",
            "Sử dụng các cụm từ chỉ tần suất như '**every now and again**' thay vì chỉ dùng 'sometimes' để gây ấn tượng mạnh.",
            "Thêm '**though**' vào cuối câu là cách cực kỳ tự nhiên để đưa ra ý kiến trái ngược trong văn nói.",
            "Không biết từ đó? Hãy dùng **Circumlocution** - giải thích vòng quanh. Ví dụ: quên từ 'brochure', hãy nói 'a magazine with holiday info'. 🔄",
            "Đừng ngại đưa ra quan điểm mạnh mẽ (Strong Opinions). Nó giúp cuộc hội thoại hào hứng và tự nhiên hơn nhiều!",
            "Nếu cần thời gian suy nghĩ, đừng im lặng. Hãy nói: 'Let me just think about that for a moment'.",
            "Ở Part 3, hãy thử dùng các cụm từ nhượng bộ như 'While it's true that..., I believe...' để thể hiện tư duy phản biện.",
            "Để nói tự nhiên, hãy nối âm. Ví dụ, 'an apple' nghe như 'anapple'. Kỹ thuật này gọi là liaison.",
            "Sử dụng ngữ điệu (intonation) để thể hiện cảm xúc. Lên giọng ở cuối câu hỏi Yes/No, xuống giọng ở câu hỏi Wh-."
        ],
        en: [
            "Try to **think in English** directly! Don't translate from your native language in your head. 🧠",
            "Pro tip: Don't pronounce 'to' as /tu:/; use the weak form **/tə/** to sound more like a native.",
            "Use fillers like 'Let me see...' or 'That's an interesting question...' to buy yourself some time.",
            "Minor mistakes are fine; keeping your flow is what matters most to the examiner.",
            "Don't stress over 'big' words; using words accurately in context is true mastery.",
            "Make eye contact and smile; you'll feel much more confident! 😊",
            "If you use a character adjective to describe someone, you should **expand on it or explain it**.",
            "In Part 2, look carefully at the **tenses** in the questions. Does it relate to the past, present, or future? ⏳",
            "You can use **cleft sentences** to emphasize your answers and impress the examiner.",
            "Don't worry too much about 'um' and 'er'. All native speakers use these to manage their fluency.",
            "Use phrases like '**every now and again**' instead of just 'occasionally' to show lexical range.",
            "Using '**though**' at the end of a sentence is a common and natural way to introduce contrast.",
            "If you don't know the word, express it in an **indirect way** (Circumlocution). Don't stop talking! 🔄",
            "Don't be afraid to express **strong opinions**. It makes the discussion much more engaging!",
            "Better to be honest if you don't understand a question. Ask for clarification instead of guessing.",
            "In Part 3, try using concessive clauses like 'While it's true that..., I believe...' to show critical thinking.",
            "To sound more natural, link your words. For example, 'an apple' sounds like 'anapple'. This is called liaison.",
            "Use intonation to convey emotion. A rising tone for Yes/No questions, and a falling tone for Wh- questions."
        ]
    },
    'WRITING': {
        vi: [
            "Biết dùng **Quá khứ hoàn thành** (had + V3) không? Nó cực phẩm để mô tả trình tự trong Task 1 đấy! ✍️",
            "Đừng dùng mãi thì Đơn, hãy đa dạng hóa bằng **Câu bị động** hoặc **Mệnh đề quan hệ**.",
            "Dành 2-3 phút lập dàn ý trước khi viết, bạn sẽ không bị 'lạc trôi' giữa chừng.",
            "Kỹ năng **Paraphrase** là vũ khí bí mật để nâng Band Lexical Resource đó.",
            "Cải thiện tính gắn kết (Cohesion) bằng cách dùng **Đại từ** (pronouns) để tránh lặp danh từ quá nhiều. 🔗",
            "Lưu ý: **Extreme adjectives** (như 'starving') chỉ được dùng với **Extreme adverbs** ('utterly', 'absolutely'). Đừng dùng 'very starving' nhé! ⚠️",
            "Sự mạch lạc (Coherence) chiếm 1/4 số điểm. Hãy đảm bảo người nghe hiểu rõ khi bạn bắt đầu ý mới hoặc đưa ra thông tin bổ sung. 🧩",
            "Cẩn thận: Lạm dụng do/does/did để nhấn mạnh có thể khiến giám khảo tưởng bạn không biết chia 'thì' đấy.",
            "Nói về thói quen cũ đã bỏ? Hãy dùng 'used to' hoặc 'would' để tăng tính đa dạng ngữ pháp.",
            "Trong Task 2, câu Thesis Statement (luận điểm) ở cuối mở bài là quan trọng nhất. Nó phải trả lời thẳng vào câu hỏi.",
            "Task 1: Đừng lúc nào cũng bắt đầu bằng 'The number of...'. Hãy thử 'There was a rise in...' hoặc 'A significant increase was seen in...'.",
            "Sử dụng từ nối một cách linh hoạt. Đừng lạm dụng 'Firstly, Secondly'. Thay vào đó, hãy dùng 'Another key point is...' hoặc 'Furthermore,'."
        ],
        en: [
            "Do you know how to use the **Past Perfect** (had + V3)? It's perfect for sequencing events in Task 1! ✍️",
            "Don't just use Simple tenses; diversify with **Passive Voice** or **Relative Clauses**.",
            "Spend 2-3 minutes outlining before you write; it keeps your ideas on track.",
            "**Paraphrasing** is your secret weapon for a higher Lexical Resource score.",
            "Improve cohesion through the use of **pronouns**. This avoids repetition and makes your writing smoother. 🔗",
            "**Extreme adjectives** (e.g. 'impossible') must only be used with **extreme adverbs** (e.g. 'completely', 'totally'). ⚠️",
            "Coherence means logical relationship. Ensure the listener understands if you are adding info or offering contrast. 🧩",
            "Be careful: if you overuse do/does/did for emphasis, you might look like you don't know the tenses.",
            "Use 'used to' and 'would' to talk about past habits or situations that are no longer true.",
            "In Task 2, your thesis statement at the end of the introduction is crucial. It must directly answer the question.",
            "Task 1: Avoid always starting with 'The number of...'. Vary your sentence starters with 'There was a rise in...' or 'A significant increase was seen in...'.",
            "Use cohesive devices flexibly. Don't overuse 'Firstly, Secondly'. Instead, try 'Another key point is...' or 'Furthermore,'."
        ]
    },
    'BROWSE': {
        vi: [
            "Thấy từ nào còn 'thô' (Raw) không? Chọn chúng và bấm **Refine with AI** để AI tự động điền chi tiết nhé.",
            "Những từ đã được AI 'tinh chỉnh' (Refined) cần bạn xem lại và xác nhận. Hãy chọn chúng và bấm **Verify**.",
            "Đừng ngần ngại thêm từ mới mỗi khi bạn bắt gặp. Càng nhiều từ, thư viện của bạn càng 'xịn'.",
            "Thử click vào một từ bất kỳ xem. Bạn sẽ thấy rất nhiều thông tin hữu ích về nó đó!",
            "Bạn có thể tùy chỉnh các cột hiển thị trong thư viện bằng cách click vào nút **View** (hình con mắt).",
            "Trong màn hình Edit, bạn có thể 'ẩn' một chi tiết (như collocation) bằng icon con mắt thay vì xoá hẳn."
        ],
        en: [
            "See any 'Raw' words? Select them and hit **Refine with AI** to let the AI automatically fill in the details.",
            "Words that have been 'Refined' by AI need your confirmation. Select them and click **Verify**.",
            "Don't hesitate to add new words whenever you encounter them. The more words, the richer your library.",
            "Try clicking on any word. You'll discover a lot of useful information about it!",
            "You can customize which columns are visible in the library by clicking the **View** button (the eye icon).",
            "In the Edit screen, you can 'ignore' a detail (like a collocation) with the eye icon instead of deleting it. Very handy!"
        ]
    },
    'DISCOVER': {
        vi: [
            "Chơi game không chỉ vui mà còn giúp bạn kiếm **Energy ⚡** để di chuyển trong chế độ Adventure đó!",
            "Mẹo học: **Quick Review** tập trung vào việc nhớ từ, còn các **trò chơi** ở đây giúp bạn ôn luyện cách dùng từ trong ngữ cảnh.",
            "Adventure Mode là nơi kiểm chứng năng lực thực sự của bạn. Hãy chinh phục bản đồ nhé!",
            "Thử **Collo Connect** xem! Nối từ với các cụm từ hay đi kèm với nó để dùng từ thật tự nhiên.",
            "**IPA Sorter** sẽ luyện tai nghe và giúp bạn phân biệt các âm dễ nhầm lẫn trong tiếng Anh.",
            "**Meaning Match** là một cách nhanh để kiểm tra bạn đã nhớ đúng nghĩa của từ chưa đấy.",
            "Thử thách sắp xếp câu với **Sentence Scramble** để hiểu sâu hơn về cấu trúc ngữ pháp.",
            "Giới từ luôn là một thử thách? Hãy chinh phục chúng với **Preposition Power**.",
            "Bạn có biết cách biến đổi một từ thành các dạng khác nhau không? Thử ngay **Word Transformer** nhé.",
            "Thành ngữ khó ư? Đã có **Idiom Connect** giúp bạn ghi nhớ chúng một cách trực quan.",
            "Luyện kỹ năng paraphrase với **Paraphrase Context**, một kỹ năng ăn điểm trong IELTS Writing.",
            "Thử thách tốc độ với **Word Scatter**! Tìm từ phù hợp với gợi ý càng nhanh càng tốt.",
            "Hãy bắt đầu cuộc phiêu lưu trong **Adventure Mode**! Đánh bại boss và làm chủ từ vựng của bạn."
        ],
        en: [
            "Playing games is not just fun! It helps you earn **Energy ⚡** to move forward in Adventure mode.",
            "Study tip: **Quick Review** focuses on core recall, while the **games** here help you practice using words in context.",
            "Adventure Mode is where you prove your true skills. Conquer the map!",
            "Try **Collo Connect**! Match words with their common partners to sound more natural.",
            "Give **IPA Sorter** a go! Train your ear to distinguish between tricky English sounds.",
            "**Meaning Match** is a quick way to check if you've memorized the definitions correctly.",
            "Challenge yourself to build sentences with **Sentence Scramble** to deepen your grammar understanding.",
            "Are prepositions a challenge? Conquer them with **Preposition Power**.",
            "Do you know how to transform a word into its different forms? Try **Word Transformer** now.",
            "Idioms are tricky? **Idiom Connect** will help you remember them visually.",
            "Practice your paraphrasing skills with **Paraphrase Context**, a key skill for a high IELTS Writing score.",
            "Test your speed with **Word Scatter**! Find the word that matches the cue as fast as you can.",
            "Embark on a journey in **Adventure Mode**! Defeat bosses, collect items, and master your vocabulary."
        ]
    },
    'UNIT_LIBRARY': {
        vi: [
            "Thử chế độ **Context Recall** để tập nhớ từ ngay trong đoạn văn, hiệu quả lắm đó! 🧠",
            "Đọc kỹ các ví dụ sẽ giúp bạn hiểu 'linh hồn' của từ thay vì chỉ học vẹt.",
            "Gặp từ nào hay trong bài đọc, hãy bấm giữ để 'link' nó vào thư viện ngay nhé!",
            "Sau khi học xong một từ, hãy **tự đặt một câu ví dụ** gắn liền với đời sống của bạn. Não sẽ nhớ lâu hơn đấy! 📝",
            "Chế độ 'Flashcard' trong một Unit là cách tuyệt vời để kiểm tra nhanh trước khi bắt đầu bài đọc."
        ],
        en: [
            "Try **Context Recall** mode to practice remembering words within the text. It works! 🧠",
            "Read the examples carefully to understand the 'soul' of the word, not just its definition.",
            "Found a great word in the text? Long-press to link it to your library instantly!",
            "After learning a word, **create your own personalized example sentence**. It locks the word in your memory! 📝",
            "Using 'Flashcard' mode within a Unit is a great way to do a quick review before tackling the reading passage."
        ]
    },
    'MIMIC': {
        vi: [
            "Nghe kỹ ngữ điệu của người bản xứ và thử 'copy' lại cả cảm xúc của họ xem sao! 🎙️",
            "Phát âm chuẩn giúp bạn ghi điểm cực mạnh trong mắt examiner đó.",
            "Mẹo: Các từ như 'and', 'can', 'of' thường được đọc lướt (weak forms) thành /ən/, /kən/, /əv/.",
            "Âm **Schwa /ə/** là âm phổ biến nhất tiếng Anh. Nó không bao giờ xuất hiện ở âm tiết có trọng âm đâu nhé! 🤫",
            "Tiếng Anh có nhịp điệu (Sentence Stress). Nhấn vào từ quan trọng, lướt qua từ phụ để nghe tự nhiên hơn. 🎶",
            "Luyện tập với các **Minimal pairs** (cặp từ chỉ khác nhau 1 nguyên âm) để chuẩn hóa phát âm tuyệt đối.",
            "Sử dụng **Contractions** (viết tắt) như 'I'm', 'don't' giúp mạch nói trôi chảy và tự nhiên hơn.",
            "Chú ý đến các phụ âm cuối (ending sounds) như /t/, /d/, /s/. Người Việt mình hay bỏ qua chúng lắm.",
            "Nghe và bắt chước 'nhạc điệu' của câu (sentence rhythm). Từ nào được nhấn, từ nào được lướt qua?"
        ],
        en: [
            "Listen closely to the native intonation and try to copy their emotions too! 🎙️",
            "Clear pronunciation leaves a lasting positive impression on the examiner.",
            "Tip: Functional words like 'and', 'can', 'of' are often reduced (weak forms) to /ən/, /kən/, /əv/.",
            "The **Schwa /ə/** is the most common sound in English. It cannot appear in a stressed syllable. 🤫",
            "Sentence stress gives English its rhythm. Stress important words and fit the rest in the spaces. 🎶",
            "Find and practice **minimal pairs** to improve your vowel accuracy significantly.",
            "Using **contractions** like 'I'm' or 'we'll' makes your speaking sound more natural and fluent.",
            "Pay close attention to ending sounds like /t/, /d/, and /s/. They are often omitted by non-native speakers.",
            "Listen for and mimic the 'music' of the sentence (sentence rhythm). Which words are stressed, and which are unstressed?"
        ]
    },
    'IRREGULAR_VERBS': {
        vi: [
            "Mấy động từ này tuy 'bướng' nhưng dùng cực nhiều. Thuộc lòng chúng là lợi thế lớn đó! 💀",
            "Sai thì quá khứ là lỗi rất dễ bị trừ điểm. Cẩn thận with cột 2 và cột 3 nhé.",
            "V2 của 'begin' là gì nhỉ? Thử thách trí nhớ của bạn chút nào.",
            "Mẹo học: Nhóm các động từ có mẫu tương tự nhau, ví dụ: sing-sang-sung, ring-rang-rung, drink-drank-drunk."
        ],
        en: [
            "These verbs are a bit stubborn, but they're used everywhere. Mastering them is a big win! 💀",
            "Wrong past tense forms are easy points lost. Be careful with V2 and V3.",
            "What's the V2 of 'begin'? Let's test your memory.",
            "Learning tip: Group verbs with similar patterns, for example: sing-sang-sung, ring-rang-rung, drink-drank-drunk."
        ]
    },
    'PARAPHRASE': {
        vi: [
            "Đừng dùng 'very hot' nữa, hãy thử **'scorching'** xem sao?",
            "Paraphrase không chỉ là thay từ, mà là thay cả cấu trúc câu đó.",
            "Diễn đạt lại ý tưởng là kỹ năng ăn điểm trong cả Speaking và Writing.",
            "Một cách paraphrase hiệu quả là đổi dạng từ: 'The economy grew' -> 'There was economic growth'."
        ],
        en: [
            "Instead of 'very hot', try using **'scorching'**.",
            "Paraphrasing isn't just about changing words, but also sentence structures.",
            "Restating ideas is a key scoring skill in both Speaking and Writing.",
            "A powerful paraphrasing technique is changing the word form: 'The economy grew' -> 'There was economic growth'."
        ]
    },
    'WORD_NET': {
        vi: [
            "Thử liệt kê các thành phần và gom nhóm từ 'Phở' xem sao? 🍜",
            "Gom nhóm các bộ phận của một cái cây (tree) nào!",
            "Visual lại cấu trúc sẽ giúp tăng trí nhớ hình ảnh và liên kết thần kinh đấy.",
            "Khi viết essay, hãy nghĩ về các nhóm từ bạn đã tạo. Điều này giúp bạn dùng từ vựng đa dạng về cùng một chủ đề."
        ],
        en: [
            "Let's try listing components and grouping words for 'Pho'. 🍜",
            "Let's group the parts of a tree!",
            "Visualizing the structure will help improve visual memory and neural connections.",
            "When writing an essay, think about your word nets. This helps you use a wide range of topic-specific vocabulary."
        ]
    },
    'COMPARISON': {
        vi: [
            "Biết phân biệt 'hurt' và 'pain' không?",
            "Cùng phân biệt các từ giống nhau gây 'lú' nào.",
            "Phân biệt từ đồng nghĩa là cách hay để hiểu sâu sắc hơn về từ vựng.",
            "Khi so sánh, hãy chú ý đến sắc thái (connotation). 'Slim' và 'skinny' đều có nghĩa là gầy, nhưng 'slim' mang sắc thái tích cực hơn."
        ],
        en: [
            "Do you know the difference between 'hurt' and 'pain'?",
            "Let's differentiate some confusingly similar words.",
            "Distinguishing synonyms is a great way to deepen your vocabulary understanding.",
            "When comparing words, consider their connotation. Both 'slim' and 'skinny' mean thin, but 'slim' is generally more positive."
        ]
    }
};

export const GENERAL_MESSAGES = {
    backup_urgent: {
        vi: () => "Cẩn thận vẫn hơn! 🛡️ Sao lưu dữ liệu ngay kẻo công sức học hành 'bay màu' nhé!",
        en: () => "Better safe than sorry! 🛡️ Backup your data now so your hard work doesn't disappear!"
    },
    empty_library: {
        vi: () => "Thư viện đang trống trơn nè! 🌵 Mau thêm vài từ mới để chúng mình cùng học nào.",
        en: () => "Your library is empty! 🌵 Let's add some new words and start learning together."
    },
    srs_due: {
        vi: (count: number) => `Có **${count} từ** đang bắt đầu phai nhạt trong trí nhớ rồi. Vào 'ôn lại chuyện cũ' thôi! ⏰`,
        en: (count: number) => `**${count} words** are starting to fade from your memory. Time for a quick catch-up! ⏰`
    },
    daily_goal: {
        vi: (remain: number) => `Chỉ còn **${remain} từ** nữa là chạm mốc hôm nay rồi. Cố gắng thêm chút nữa để nhận **+1 Energy ⚡** nhé!`,
        en: (remain: number) => `Only **${remain} more words** to reach your goal. Keep going to earn **+1 Energy ⚡**!`
    },
    lazy_day: {
        vi: () => "Mỗi ngày một ít thôi cũng được, đừng để mạch học bị ngắt quãng nhé. ✨",
        en: () => "Even a few words a day help. Don't break your streak! ✨"
    }
};

export const FALLBACK_MESSAGES = {
    vi: [
        "Học xong một từ rồi? Đừng quên tự đặt một câu ví dụ thật 'đời' cho nó nhé! 🧠",
        "Học nữa, học mãi, mục tiêu IELTS Band cao đang chờ bạn đó! 🔥",
        "Mỗi từ bạn học hôm nay là một viên gạch xây nên thành công mai sau. ✨",
        "Bạn đang làm rất tốt, cứ tiếp tục duy trì phong độ này nhé!",
        "Đừng quên nghỉ ngơi một chút sau khi học xong để não bộ ghi nhớ tốt hơn nhé. ☕",
        "Sự kiên trì chính là chìa khóa của điểm 8.0+ đấy!"
    ],
    en: [
        "Just learned a word? Don't forget to create your own personalized example sentence! 🧠",
        "Keep learning; your high IELTS score is just around the corner! 🔥",
        "Every word you master today is a stepping stone to your future success. ✨",
        "You're doing great! Keep up the amazing work!",
        "Remember to take a small break after studying to let the knowledge sink in. ☕",
        "Persistence is the ultimate key to achieving 8.0+!"
    ]
};
