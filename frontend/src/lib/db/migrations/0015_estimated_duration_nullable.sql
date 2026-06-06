-- 任务预估时长改为可空：模糊任务无需强制填写
ALTER TABLE tasks ALTER COLUMN estimated_duration DROP NOT NULL;
