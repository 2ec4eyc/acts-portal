sed -i '3780,3827c\
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">\
            <div className="space-y-1.5">\
              <label className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest">Filter Semester</label>\
              <select value={semesterFilter} onChange={(e) => setSemesterFilter(e.target.value)} className="w-full bg-white border border-fb-border rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-fb-blue transition-all appearance-none">\
                <option value="">All Semesters</option>\
                {Array.from(new Set(courses.map(c => c.semester))).filter(Boolean).sort().map(sem => (\
                  <option key={sem} value={sem}>{sem}</option>\
                ))}\
              </select>\
            </div>\
            <div className="space-y-1.5">\
              <label className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest">Filter School Year</label>\
              <select value={schoolYearFilter} onChange={(e) => setSchoolYearFilter(e.target.value)} className="w-full bg-white border border-fb-border rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-fb-blue transition-all appearance-none">\
                <option value="">All School Years</option>\
                {Array.from(new Set(courses.map(c => c.schoolYear))).filter(Boolean).sort().reverse().map(sy => (\
                  <option key={sy} value={sy}>{sy}</option>\
                ))}\
              </select>\
            </div>\
          </div>\
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-fb-border">\
            <div className="space-y-1.5" ref={dropdownRef}>\
              <label className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest">Select Course</label>\
              <div className="relative">\
                <div \
                  className="w-full bg-white border border-fb-border rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-fb-blue transition-all cursor-pointer flex justify-between items-center"\
                  onClick={() => setIsCourseDropdownOpen(!isCourseDropdownOpen)}\
                >\
                  <span className={selectedCourse ? "text-fb-textPrimary" : "text-fb-textSecondary"}>\
                    {selectedCourse ? (courses.find(c => c.id === selectedCourse)?.name + " (" + courses.find(c => c.id === selectedCourse)?.schoolYear + " - " + courses.find(c => c.id === selectedCourse)?.semester + ")") : "-- Choose Course --"}\
                  </span>\
                  <ChevronDown size={16} className={`text-fb-textSecondary transition-transform ${isCourseDropdownOpen ? '\''rotate-180'\'' : '\'''\''}`} />\
                </div>\
                {isCourseDropdownOpen && (\
                  <div className="absolute z-50 mt-2 w-full bg-white border border-fb-border rounded-xl shadow-xl overflow-hidden flex flex-col">\
                    <div className="p-3 border-b border-fb-border sticky top-0 bg-white">\
                      <div className="relative">\
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-fb-textSecondary" size={16} />\
                        <input \
                          type="text" \
                          placeholder="Search course name..." \
                          value={courseSearch} \
                          onChange={(e) => setCourseSearch(e.target.value)} \
                          className="w-full pl-9 pr-3 py-2 bg-fb-gray/50 border border-fb-border rounded-lg text-sm font-semibold outline-none focus:border-fb-blue transition-all" \
                          autoFocus\
                        />\
                      </div>\
                    </div>\
                    <div className="max-h-60 overflow-y-auto p-2">\
                      {courses.filter(c => {\
                        const matchSearch = c.name.toLowerCase().includes(courseSearch.toLowerCase());\
                        const matchSem = semesterFilter === '\''\'' || c.semester === semesterFilter;\
                        const matchSY = schoolYearFilter === '\''\'' || c.schoolYear === schoolYearFilter;\
                        return matchSearch && matchSem && matchSY;\
                      }).length === 0 ? (\
                        <div className="p-3 text-sm text-fb-textSecondary text-center italic">No courses found</div>\
                      ) : (\
                        courses.filter(c => {\
                          const matchSearch = c.name.toLowerCase().includes(courseSearch.toLowerCase());\
                          const matchSem = semesterFilter === '\''\'' || c.semester === semesterFilter;\
                          const matchSY = schoolYearFilter === '\''\'' || c.schoolYear === schoolYearFilter;\
                          return matchSearch && matchSem && matchSY;\
                        }).map(c => (\
                          <div \
                            key={c.id} \
                            onClick={() => {\
                              setSelectedCourse(c.id);\
                              setIsCourseDropdownOpen(false);\
                            }}\
                            className={`px-3 py-2 text-sm font-semibold rounded-lg cursor-pointer transition-all ${selectedCourse === c.id ? '\''bg-fb-blue text-white'\'' : '\''hover:bg-fb-gray text-fb-textPrimary'\''}`}\
                          >\
                            {c.name} ({c.schoolYear} - {c.semester})\
                          </div>\
                        ))\
                      )}\
                    </div>\
                  </div>\
                )}\
              </div>\
            </div>\
            <div className="space-y-1.5">\
              <label className="text-[10px] font-black text-fb-textSecondary uppercase tracking-widest">Select Date</label>\
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full bg-white border border-fb-border rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-fb-blue transition-all" />\
            </div>\
          </div>\
' index.tsx
