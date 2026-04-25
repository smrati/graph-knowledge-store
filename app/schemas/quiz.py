from pydantic import BaseModel, Field


class QuizGenerateRequest(BaseModel):
    topics: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    quiz_type: str = Field(pattern="^(mcq|short_answer|flashcard)$")
    num_questions: int = Field(default=5, ge=1, le=15)


class McqOption(BaseModel):
    label: str
    text: str


class McqQuestion(BaseModel):
    question: str
    options: list[McqOption]
    correct_index: int
    explanation: str


class ShortAnswerQuestion(BaseModel):
    question: str
    model_answer: str
    key_points: list[str]


class FlashcardItem(BaseModel):
    front: str
    back: str
    hint: str


class QuizResponse(BaseModel):
    quiz_type: str
    topics: list[str]
    keywords: list[str]
    article_count: int
    questions: list[dict]
