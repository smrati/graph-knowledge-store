import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

export default function LatexText({ text }: { text: string }) {
  const parts = useMemo(() => {
    const result: { type: "text" | "math"; content: string }[] = [];
    const regex = /\$([^$]+)\$/g;
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > last) {
        result.push({ type: "text", content: text.slice(last, match.index) });
      }
      result.push({ type: "math", content: match[1] });
      last = regex.lastIndex;
    }
    if (last < text.length) {
      result.push({ type: "text", content: text.slice(last) });
    }
    return result;
  }, [text]);

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === "text") return part.content;
        try {
          const html = katex.renderToString(part.content, {
            throwOnError: false,
            displayMode: false,
          });
          return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
        } catch {
          return <code key={i}>{part.content}</code>;
        }
      })}
    </>
  );
}
