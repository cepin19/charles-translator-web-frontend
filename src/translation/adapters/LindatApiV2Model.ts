import { IsoLanguage } from "../domain/IsoLanguage";
import { Message } from "../domain/Message";
import { TranslationError } from "../domain/TranslationError";
import { TranslationErrorCode } from "../domain/TranslationErrorCode";
import { TranslationStep } from "../domain/TranslationStep";
import { API_URL, TRANSLATION_PROMPT } from "../../config/api";

export class LindatApiV2Model implements TranslationStep {
  readonly origin: IsoLanguage;
  readonly target: IsoLanguage;

  constructor(origin: IsoLanguage, target: IsoLanguage) {
    this.origin = origin;
    this.target = target;
  }

  public async executeOn(
    message: Message,
  ): Promise<Message | TranslationError> {
    if (message.language !== this.origin) {
      throw Error(
        `The given message language is '${message.language}' ` +
          `but this translation step expects '${this.origin}'.`,
      );
    }

    // skip the API request for empty messages
    if (message.text.trim() === "") {
      return message.makeTranslation(this.target, "");
    }

    const normalizedMessageText = message.text.normalize("NFC");
    const encodedLoggingConsent = message.author.acceptsDataCollection
      ? "true"
      : "false";

    const prompt = TRANSLATION_PROMPT;
    const payload = new URLSearchParams({
      input_text: normalizedMessageText,
      logInput: encodedLoggingConsent,
      inputType: message.inputMethod,
      author: message.author.organizationName,
      src: this.origin,
      tgt: this.target,
    });
    if (prompt !== "") {
      payload.set("prompt", prompt);
    }

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: payload,
      });

      if (response.ok) {
        const segments = (await response.json()) as string[];
        const translatedText = segments.join(" ");
        return message.makeTranslation(this.target, translatedText);
      }

      if (response.status === 413) {
        return new TranslationError(
          TranslationErrorCode.MessageTooLarge,
          "Message to be translated is too large.",
        );
      }

      if (response.status === 504) {
        return new TranslationError(
          TranslationErrorCode.TranslationTimeout,
          "Translation process took too long and timed out.",
        );
      }

      return new TranslationError(
        TranslationErrorCode.Failed,
        "Translation backend responded with a non-200 status code.",
      );
    } catch (error) {
      if (error instanceof SyntaxError) {
        return new TranslationError(
          TranslationErrorCode.InvalidServerResponseFormat,
          "The response from the backend server has unexpected format.",
        );
      }

      if (error instanceof Error) {
        return new TranslationError(
          TranslationErrorCode.Failed,
          `Backend request failed: [${error.name}] ${error.message}`,
        );
      }

      return new TranslationError(
        TranslationErrorCode.Failed,
        "Backend request failed.",
      );
    }
  }
}
