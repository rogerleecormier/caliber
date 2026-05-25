'use server';

import {
  archiveLinkedinJobs,
  deleteLinkedinJobs,
  getLinkedinCronInfo,
  getLinkedinJobHistory,
  getSavedLinkedinSearches,
  setLinkedinJobStatus,
} from "@/server/functions/linkedin-searches";

export {
  archiveLinkedinJobs as archivePipelineJobs,
  deleteLinkedinJobs as deletePipelineJobs,
  getLinkedinCronInfo as getPipelineCronInfo,
  getLinkedinJobHistory as getPipelineJobHistory,
  getSavedLinkedinSearches as getSavedPipelineSearches,
  setLinkedinJobStatus as setPipelineJobStatus,
};
