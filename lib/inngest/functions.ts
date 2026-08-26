import { inngest } from "./client";

/** Scaffold smoke test: proves the app is registered with the Inngest dev server. */
export const helloWorld = inngest.createFunction(
  { id: "hello-world" },
  { event: "app/hello.world" },
  async ({ event, step }) => {
    const greeting = await step.run("build-greeting", () => `Hello, ${event.data.message}!`);
    return { greeting };
  },
);

export const functions = [helloWorld];
