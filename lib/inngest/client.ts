import { EventSchemas, Inngest } from "inngest";
import type { Analysis } from "@/lib/schemas/analysis";

type Events = {
  "app/hello.world": { data: { message: string } };
  /** A reference video is ready to be watched. */
  "analysis.requested": { data: { jobId: string; videoPath: string } };
  /** Turn a finished analysis into generation prompts. */
  "recreation.requested": {
    data: {
      jobId: string;
      analysis: Analysis;
      replaceTargetId: string;
      characterDescription: string;
    };
  };
};

export const inngest = new Inngest({
  id: "reelcloner",
  schemas: new EventSchemas().fromRecord<Events>(),
});
