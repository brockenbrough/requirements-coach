export type LLMRatingResult = {
  score: number;
  feedback: string;
};

export interface LLMProvider {
  rateAcceptanceCriteria(userStory: string, submittedText: string): Promise<LLMRatingResult>;
}