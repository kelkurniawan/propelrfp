"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/auth/FormField";
import { INDUSTRIES } from "@/types";
import { createClient } from "@/lib/supabase/client";

const orgStepSchema = z.object({
  name: z.string().min(1, "Org name is required").max(100),
  industry: z.enum(INDUSTRIES as readonly [string, ...string[]]),
});
type OrgStepInput = z.infer<typeof orgStepSchema>;

export default function SignupOrgPage() {
  const router = useRouter();
  const supabase = createClient();
  const [defaults, setDefaults] = useState<Partial<OrgStepInput>>({});
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OrgStepInput>({ resolver: zodResolver(orgStepSchema) });

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const fullName =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined);
      if (fullName) {
        const suggestion = `${fullName.split(" ")[0]}'s Workspace`;
        setDefaults({ name: suggestion });
        setValue("name", suggestion);
      }
    })();
  }, [supabase, router, setValue]);

  async function onSubmit(values: OrgStepInput) {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create-org", ...values }),
    });
    const json = await res.json();
    if (json.error) {
      toast.error(json.error.message);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  const industry = watch("industry");

  return (
    <AuthCard title="Tell us about your company" subtitle="Step 2 of 2: organization">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Organization name" htmlFor="name" error={errors.name?.message}>
          <Input id="name" defaultValue={defaults.name ?? ""} {...register("name")} />
        </FormField>
        <FormField label="Industry" htmlFor="industry" error={errors.industry?.message}>
          <Select
            value={industry}
            onValueChange={(v) => setValue("industry", v as OrgStepInput["industry"])}
          >
            <SelectTrigger id="industry">
              <SelectValue placeholder="Select industry" />
            </SelectTrigger>
            <SelectContent>
              {INDUSTRIES.map((i) => (
                <SelectItem key={i} value={i}>
                  {i}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Creating workspace..." : "Create workspace"}
        </Button>
      </form>
    </AuthCard>
  );
}
