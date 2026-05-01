"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/auth/FormField";
import { orgUpdateSchema, type OrgUpdateInput } from "@/lib/schemas/org";
import { INDUSTRIES } from "@/types";

const SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"] as const;

type Org = {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  size: string | null;
};

export function OrgForm({ initialData, canEdit }: { initialData: Org; canEdit: boolean }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OrgUpdateInput>({
    resolver: zodResolver(orgUpdateSchema),
    defaultValues: {
      name: initialData.name,
      industry: (initialData.industry ?? INDUSTRIES[0]) as OrgUpdateInput["industry"],
      website: initialData.website ?? "",
      size: (initialData.size as OrgUpdateInput["size"]) ?? undefined,
    },
  });

  async function onSubmit(values: OrgUpdateInput) {
    const res = await fetch("/api/org", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const json = await res.json();
    if (json.error) {
      toast.error(json.error.message);
      return;
    }
    toast.success("Saved");
    router.refresh();
  }

  const industry = watch("industry");
  const size = watch("size");
  const disabled = !canEdit;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid max-w-2xl gap-4">
      <FormField label="Organization name" htmlFor="name" error={errors.name?.message}>
        <Input id="name" disabled={disabled} {...register("name")} />
      </FormField>
      <FormField label="Industry" htmlFor="industry" error={errors.industry?.message}>
        <Select
          value={industry}
          onValueChange={(v) => setValue("industry", v as OrgUpdateInput["industry"])}
          disabled={disabled}
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
      <FormField label="Website" htmlFor="website" error={errors.website?.message}>
        <Input
          id="website"
          type="url"
          placeholder="https://..."
          disabled={disabled}
          {...register("website")}
        />
      </FormField>
      <FormField label="Company size" htmlFor="size" error={errors.size?.message}>
        <Select
          value={size ?? undefined}
          onValueChange={(v) => setValue("size", v as OrgUpdateInput["size"])}
          disabled={disabled}
        >
          <SelectTrigger id="size">
            <SelectValue placeholder="Select size" />
          </SelectTrigger>
          <SelectContent>
            {SIZES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      {canEdit ? (
        <div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save changes"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
