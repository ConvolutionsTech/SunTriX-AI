import { useQuery } from "@tanstack/react-query";
import { apiRequest, ENDPOINTS } from "@/lib/api";

/** Company profile edited in Admin → Site Copy. GET /cms/company returns it flat. */
export interface CompanyInfo {
  name?: string;
  tagline?: string;
  description?: string;
  email?: string;
  phone?: string;
  address?: string;
  responseTime?: string;
}

/** Shared, cached company info — one request per page load instead of one per component. */
export function useCompanyInfo(): CompanyInfo {
  const { data } = useQuery({
    queryKey: ["cms", "company"],
    queryFn: async () => {
      const { data, error } = await apiRequest<CompanyInfo>(ENDPOINTS.CMS_COMPANY);
      if (error) throw new Error(error);
      return data ?? {};
    },
    staleTime: 5 * 60 * 1000,
  });
  return data ?? {};
}
