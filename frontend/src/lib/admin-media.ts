import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminReq, adminToken } from "./admin.js";
import { requestJson } from "./http.js";

export type AdminMedia = { id:string; filename:string; title:string|null; type:string; size:number; created_at:string };
type MediaPage = { items:AdminMedia[]; total:number; page:number; limit:number };
export function useAdminMedia(page:number,q:string) {
  return useQuery({ queryKey:["adm","media",page,q],queryFn:() => adminReq<MediaPage>("GET",`/admin/media?page=${page}&q=${encodeURIComponent(q)}`),retry:false });
}
export function useMediaMutations() {
  const cache=useQueryClient();
  const refresh=() => cache.invalidateQueries({queryKey:["adm","media"]});
  const upload=useMutation({mutationFn:async (file:File) => {
    const body=new FormData();body.append("file",file);
    const token=adminToken();
    return requestJson<AdminMedia>("/admin/media",{method:"POST",headers:token ? {authorization:`Bearer ${token}`} : {},body},{errorMessage:(_status,data) => data?.error || "Не удалось загрузить файл"});
  },onSuccess:refresh});
  const remove=useMutation({mutationFn:(id:string) => adminReq("DELETE",`/admin/media/${id}`),onSuccess:refresh});
  return {upload,remove};
}
export async function previewMedia(id:string):Promise<string> {
  const token=adminToken();
  const response=await fetch(`/api/admin/media/${id}/content`,{headers:token ? {authorization:`Bearer ${token}`} : {}});
  if (!response.ok) throw new Error("Не удалось открыть изображение");
  return URL.createObjectURL(await response.blob());
}
