sed -i '/const \[schoolYearFilter, setSchoolYearFilter\] = useState('\'''\'');/a\
  const [isCourseDropdownOpen, setIsCourseDropdownOpen] = useState(false);\
  const dropdownRef = useRef<HTMLDivElement>(null);\
\
  useEffect(() => {\
    const handleClickOutside = (event: MouseEvent) => {\
      if (dropdownRef.current \&\& !dropdownRef.current.contains(event.target as Node)) {\
        setIsCourseDropdownOpen(false);\
      }\
    };\
    document.addEventListener('\''mousedown'\'', handleClickOutside);\
    return () => document.removeEventListener('\''mousedown'\'', handleClickOutside);\
  }, []);\
' index.tsx
