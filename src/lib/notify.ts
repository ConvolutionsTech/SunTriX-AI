import { toast } from "@/hooks/use-toast";

/** Short success/error toasts through the app's mounted <Toaster /> (shadcn). */
export const notify = {
  success: (title: string) => toast({ title }),
  error: (title: string) => toast({ title, variant: "destructive" }),
};
