import { EventSchemas, Inngest } from "inngest";

/**
 * Event map for the pipeline. Stages 4-6 fill in the real payloads;
 * for now only the scaffold's hello-world event is defined.
 */
type Events = {
  "app/hello.world": { data: { message: string } };
};

export const inngest = new Inngest({
  id: "reelcloner",
  schemas: new EventSchemas().fromRecord<Events>(),
});
