export function baseRules(input: string, focusArea: string): string {
    return `You are an IELTS examiner tasked with creating a ${focusArea} practice test for: "${input}"

BASE RULES:
- Go straight to create only 1 entirely new question, DO NOT duplicate with previous one. focused solely on ${focusArea} and the target word(s) "${input}".
- Output only as an array of JSON objects with keys "q" for question and "o" for options.
- Each option maps to an object with "isCorrect" ("true"/"false") and "explanation" (string).
- Use clear, concise English suitable for IELTS 6.5–8.0.
- Do not reveal answers in questions.

QUESTION & ANSWER FORMAT:
  {
    "q": "Question string with __ as blank",
    "o": {
      "option1": { "isCorrect": "true", "explanation": "Explanation why correct" },
      "option2": { "isCorrect": "false", "explanation": "Explanation why incorrect" },
      "option3": { "isCorrect": "false", "explanation": "Explanation why incorrect" },
      "option4": { "isCorrect": "false", "explanation": "Explanation why incorrect" }
    }
  }
- Each question has exactly 4 options; correct answer is always first.
- Avoid words like "correct", "answer", or "explanation" in the options themselves.

DISTRACTOR RULES:
- Distractors match the part of speech and context of the correct answer.
- They should be plausible, semantically close but incorrect.

Avoid these common MISTAKES:
- AVOID: No unrelated questions or blanks without clear ask.
- AVOID: No [Multi] or Markdown format.
- AVOID: No explanations outside of JSON objects.
- AVOID: The correct answer is not first option.
`;
}

export function collocationPrompt(input: string): string {
    return `${baseRules(input, 'collocation')}
Test content:
- Focus on collocation testing across all sections whenever possible.
- Question must have blank __.
- The blank __ must be right before or right after the target word "${input}" in the question.
- The explanation must clearly explain the collocation and why the correct answer fits while the distractors do not.

EXAMPLE to generate for "harsh":
[
  {
    "q": "He received a __ harsh ${input}.",
    "o": {
      "punishment": {
        "isCorrect": "true",
        "explanation": "Punishment collocates naturally with 'harsh' indicating a severe penalty."
      },
      "compliment": {
        "isCorrect": "false",
        "explanation": "Compliment does not collocate with 'harsh' as it implies praise, which conflicts with 'harsh'."
      },
      "gift": {
        "isCorrect": "false",
        "explanation": "Gift is unrelated as 'harsh' describes severity, not generosity."
      },
      "greeting": {
        "isCorrect": "false",
        "explanation": "Greeting does not fit semantically with 'harsh'."
      }
    }
  }
]
`;
}

export function prepositionPrompt(input: string): string {
    return `${baseRules(input, 'preposition')}
FOCUS RULE:
Emphasize dependent prepositions and preposition patterns throughout the test.

EXAMPLE:
PREPOSITION PRACTICE TEST for "${input}"

[
  {
    "q": "She is interested __ learning new languages.",
    "o": {
      "in": {
        "isCorrect": "true",
        "explanation": "'Interested in' is the correct prepositional phrase."
      },
      "on": {
        "isCorrect": "false",
        "explanation": "'Interested on' is incorrect usage."
      },
      "at": {
        "isCorrect": "false",
        "explanation": "'Interested at' is incorrect usage."
      },
      "for": {
        "isCorrect": "false",
        "explanation": "'Interested for' is incorrect usage."
      }
    }
  },
  {
    "q": "They apologized __ the mistake.",
    "o": {
      "for": {
        "isCorrect": "true",
        "explanation": "'Apologized for' is the correct prepositional phrase."
      },
      "to": {
        "isCorrect": "false",
        "explanation": "'Apologized to' is used differently, not fitting here."
      },
      "with": {
        "isCorrect": "false",
        "explanation": "'Apologized with' is incorrect usage."
      },
      "by": {
        "isCorrect": "false",
        "explanation": "'Apologized by' is incorrect usage."
      }
    }
  },
  {
    "q": "He is good __ playing tennis.",
    "o": {
      "at": {
        "isCorrect": "true",
        "explanation": "'Good at' is the correct prepositional phrase."
      },
      "in": {
        "isCorrect": "false",
        "explanation": "'Good in' is incorrect usage."
      },
      "on": {
        "isCorrect": "false",
        "explanation": "'Good on' is incorrect usage."
      },
      "with": {
        "isCorrect": "false",
        "explanation": "'Good with' is incorrect usage."
      }
    }
  }
]

Generate now.
`;
}

export function paraphrasePrompt(input: string): string {
    return `${baseRules(input, 'paraphrase')}
FOCUS RULE:
Prioritize paraphrase choice, synonym nuances, and register differences in all questions.

EXAMPLE:
PARAPHRASE PRACTICE TEST for "${input}"

[
  {
    "q": "Choose the best paraphrase for __ happy.",
    "o": {
      "joyful": {
        "isCorrect": "true",
        "explanation": "'Joyful' is a synonym of 'happy' with a positive connotation."
      },
      "angry": {
        "isCorrect": "false",
        "explanation": "'Angry' is an antonym of 'happy'."
      },
      "sad": {
        "isCorrect": "false",
        "explanation": "'Sad' is an antonym of 'happy'."
      },
      "tired": {
        "isCorrect": "false",
        "explanation": "'Tired' is unrelated in meaning to 'happy'."
      }
    }
  },
  {
    "q": "Which word best replaces __ quickly?",
    "o": {
      "rapidly": {
        "isCorrect": "true",
        "explanation": "'Rapidly' is a synonym of 'quickly'."
      },
      "slowly": {
        "isCorrect": "false",
        "explanation": "'Slowly' is an antonym of 'quickly'."
      },
      "loudly": {
        "isCorrect": "false",
        "explanation": "'Loudly' relates to sound, not speed."
      },
      "softly": {
        "isCorrect": "false",
        "explanation": "'Softly' relates to volume, not speed."
      }
    }
  },
  {
    "q": "Select the synonym for __ help.",
    "o": {
      "assist": {
        "isCorrect": "true",
        "explanation": "'Assist' is a synonym of 'help'."
      },
      "ignore": {
        "isCorrect": "false",
        "explanation": "'Ignore' is an antonym of 'help'."
      },
      "hinder": {
        "isCorrect": "false",
        "explanation": "'Hinder' is an antonym of 'help'."
      },
      "neglect": {
        "isCorrect": "false",
        "explanation": "'Neglect' is an antonym of 'help'."
      }
    }
  }
]

Generate now.
`;
}

export function wordFamilyPrompt(input: string): string {
    return `${baseRules(input, 'wordFamily')}
FOCUS RULE:
Highlight word family forms, part-of-speech shifts, and form-choice accuracy in every section.

EXAMPLE:
WORD FAMILY PRACTICE TEST for "${input}"

[
  {
    "q": "Choose the correct noun form of __ decide.",
    "o": {
      "decision": {
        "isCorrect": "true",
        "explanation": "'Decision' is the noun form of 'decide'."
      },
      "decide": {
        "isCorrect": "false",
        "explanation": "'Decide' is the base verb, not a noun."
      },
      "decisive": {
        "isCorrect": "false",
        "explanation": "'Decisive' is an adjective form."
      },
      "deciding": {
        "isCorrect": "false",
        "explanation": "'Deciding' is the present participle form."
      }
    }
  },
  {
    "q": "Select the adjective form of __ beauty.",
    "o": {
      "beautiful": {
        "isCorrect": "true",
        "explanation": "'Beautiful' is the adjective form of 'beauty'."
      },
      "beauty": {
        "isCorrect": "false",
        "explanation": "'Beauty' is a noun."
      },
      "beautify": {
        "isCorrect": "false",
        "explanation": "'Beautify' is a verb."
      },
      "beautifully": {
        "isCorrect": "false",
        "explanation": "'Beautifully' is an adverb."
      }
    }
  },
  {
    "q": "Pick the verb form of __ strength.",
    "o": {
      "strengthen": {
        "isCorrect": "true",
        "explanation": "'Strengthen' is the verb form of 'strength'."
      },
      "strength": {
        "isCorrect": "false",
        "explanation": "'Strength' is a noun."
      },
      "strong": {
        "isCorrect": "false",
        "explanation": "'Strong' is an adjective."
      },
      "strongly": {
        "isCorrect": "false",
        "explanation": "'Strongly' is an adverb."
      }
    }
  }
]

Generate now.
`;
}

export function getStudyBuddyTestPrompt(
    input: string,
    focusArea?: 'collocation' | 'preposition' | 'paraphrase' | 'wordFamily'
): string {
    switch (focusArea) {
        case 'collocation':
            return collocationPrompt(input);
        case 'preposition':
            return prepositionPrompt(input);
        case 'paraphrase':
            return paraphrasePrompt(input);
        case 'wordFamily':
            return wordFamilyPrompt(input);
        default:
            return `Please specify a valid focusArea: 'collocation', 'preposition', 'paraphrase', or 'wordFamily'.`;
    }
}
